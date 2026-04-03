import {
  TransactionCredential,
  Transaction,
  User,
  TransactionStatus,
} from '../models';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler';
import { encryptText, decryptText } from '../utils/encryption';

interface CreateCredentialData {
  transactionId: string;
  label: string;
  username?: string;
  password: string;
}

interface UpdateCredentialData {
  label?: string;
  username?: string;
  password?: string;
}

interface DecryptedCredential {
  id: string;
  transactionId: string;
  label: string;
  username: string | null;
  password: string;
  releasedToBuyer: boolean;
  releasedAt: Date | null;
  createdBy: string;
  createdAt: Date;
}

class CredentialService {
  async createCredential(userId: string, data: CreateCredentialData): Promise<DecryptedCredential> {
    const transaction = await Transaction.findByPk(data.transactionId);
    if (!transaction) throw new NotFoundError('Transaction');

    // Only seller or admin can create credentials
    const user = await User.findByPk(userId);
    if (!user) throw new ForbiddenError('Not authenticated');

    if (transaction.sellerId !== userId && user.role !== 'ADMIN') {
      throw new ForbiddenError('Only the seller or admin can add credentials');
    }

    // Encrypt password
    const pwEncrypted = encryptText(data.password);

    // Encrypt username if provided
    let encryptedUsername: string | null = null;
    let ivUsername: string | null = null;
    let authTagUsername: string | null = null;
    if (data.username) {
      const usrEncrypted = encryptText(data.username);
      encryptedUsername = usrEncrypted.encrypted;
      ivUsername = usrEncrypted.iv;
      authTagUsername = usrEncrypted.authTag;
    }

    const credential = await TransactionCredential.create({
      transactionId: data.transactionId,
      label: data.label,
      encryptedPassword: pwEncrypted.encrypted,
      iv: pwEncrypted.iv,
      authTag: pwEncrypted.authTag,
      encryptedUsername,
      ivUsername,
      authTagUsername,
      createdBy: userId,
    });

    return this.decryptCredential(credential);
  }

  async getCredentials(transactionId: string, userId: string): Promise<DecryptedCredential[]> {
    const transaction = await Transaction.findByPk(transactionId);
    if (!transaction) throw new NotFoundError('Transaction');

    const user = await User.findByPk(userId);
    if (!user) throw new ForbiddenError('Not authenticated');

    const isSeller = transaction.sellerId === userId;
    const isBuyer = transaction.buyerId === userId;
    const isAdmin = user.role === 'ADMIN';

    if (!isSeller && !isBuyer && !isAdmin) {
      throw new ForbiddenError('Not authorized to view credentials');
    }

    const credentials = await TransactionCredential.findAll({
      where: { transactionId },
      order: [['createdAt', 'ASC']],
    });

    // Buyer can only see released credentials when payment is confirmed
    if (isBuyer) {
      const paymentConfirmed = [
        TransactionStatus.PAYMENT_RECEIVED,
        TransactionStatus.COMPLETED,
      ].includes(transaction.status as TransactionStatus);

      if (!paymentConfirmed) return [];

      return credentials
        .filter(c => c.releasedToBuyer)
        .map(c => this.decryptCredential(c));
    }

    // Seller and admin see all, decrypted
    return credentials.map(c => this.decryptCredential(c));
  }

  async updateCredential(credentialId: string, userId: string, data: UpdateCredentialData): Promise<DecryptedCredential> {
    const credential = await TransactionCredential.findByPk(credentialId);
    if (!credential) throw new NotFoundError('Credential');

    const user = await User.findByPk(userId);
    if (!user) throw new ForbiddenError('Not authenticated');

    if (credential.createdBy !== userId && user.role !== 'ADMIN') {
      throw new ForbiddenError('Not authorized to update this credential');
    }

    const updates: Record<string, any> = {};

    if (data.label !== undefined) updates.label = data.label;

    if (data.password !== undefined) {
      const pwEncrypted = encryptText(data.password);
      updates.encryptedPassword = pwEncrypted.encrypted;
      updates.iv = pwEncrypted.iv;
      updates.authTag = pwEncrypted.authTag;
    }

    if (data.username !== undefined) {
      if (data.username) {
        const usrEncrypted = encryptText(data.username);
        updates.encryptedUsername = usrEncrypted.encrypted;
        updates.ivUsername = usrEncrypted.iv;
        updates.authTagUsername = usrEncrypted.authTag;
      } else {
        updates.encryptedUsername = null;
        updates.ivUsername = null;
        updates.authTagUsername = null;
      }
    }

    await credential.update(updates);
    return this.decryptCredential(credential);
  }

  async deleteCredential(credentialId: string, userId: string): Promise<void> {
    const credential = await TransactionCredential.findByPk(credentialId);
    if (!credential) throw new NotFoundError('Credential');

    const user = await User.findByPk(userId);
    if (!user) throw new ForbiddenError('Not authenticated');

    if (credential.createdBy !== userId && user.role !== 'ADMIN') {
      throw new ForbiddenError('Not authorized to delete this credential');
    }

    await credential.destroy();
  }

  async releaseCredentials(transactionId: string, adminId: string): Promise<void> {
    const user = await User.findByPk(adminId);
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can release credentials');
    }

    const transaction = await Transaction.findByPk(transactionId);
    if (!transaction) throw new NotFoundError('Transaction');

    await TransactionCredential.update(
      {
        releasedToBuyer: true,
        releasedAt: new Date(),
        releasedBy: adminId,
      },
      { where: { transactionId } }
    );
  }

  async revokeCredentialRelease(transactionId: string, adminId: string): Promise<void> {
    const user = await User.findByPk(adminId);
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can revoke credential release');
    }

    await TransactionCredential.update(
      {
        releasedToBuyer: false,
        releasedAt: null,
        releasedBy: null,
      },
      { where: { transactionId } }
    );
  }

  private decryptCredential(credential: TransactionCredential): DecryptedCredential {
    let username: string | null = null;
    if (credential.encryptedUsername && credential.ivUsername && credential.authTagUsername) {
      username = decryptText(credential.encryptedUsername, credential.ivUsername, credential.authTagUsername);
    }

    const password = decryptText(credential.encryptedPassword, credential.iv, credential.authTag);

    return {
      id: credential.id,
      transactionId: credential.transactionId,
      label: credential.label,
      username,
      password,
      releasedToBuyer: credential.releasedToBuyer,
      releasedAt: credential.releasedAt,
      createdBy: credential.createdBy,
      createdAt: credential.createdAt,
    };
  }
}

export const credentialService = new CredentialService();
export default credentialService;
