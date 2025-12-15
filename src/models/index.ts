import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// ==================== ENUMS ====================

export enum UserRole {
  BUYER = 'BUYER',
  SELLER = 'SELLER',
  ADMIN = 'ADMIN'
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BLOCKED = 'BLOCKED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION'
}

export enum ListingStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  ACTIVE = 'ACTIVE',
  SOLD = 'SOLD',
  RESERVED = 'RESERVED',
  SUSPENDED = 'SUSPENDED',
  REJECTED = 'REJECTED'
}

export enum ListingVisibility {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
  UNLISTED = 'UNLISTED'
}

export enum SafetyRating {
  SATISFACTORY = 'SATISFACTORY',
  CONDITIONAL = 'CONDITIONAL',
  UNSATISFACTORY = 'UNSATISFACTORY',
  NONE = 'NONE'
}

export enum AmazonRelayStatus {
  NONE = 'NONE',
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED'
}

export enum DocumentType {
  INSURANCE = 'INSURANCE',
  UCC_FILING = 'UCC_FILING',
  AUTHORITY = 'AUTHORITY',
  SAFETY_RECORD = 'SAFETY_RECORD',
  BILL_OF_SALE = 'BILL_OF_SALE',
  OTHER = 'OTHER'
}

export enum DocumentStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED'
}

export enum OfferStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  COUNTERED = 'COUNTERED',
  EXPIRED = 'EXPIRED',
  WITHDRAWN = 'WITHDRAWN'
}

export enum TransactionStatus {
  AWAITING_DEPOSIT = 'AWAITING_DEPOSIT',
  DEPOSIT_RECEIVED = 'DEPOSIT_RECEIVED',
  IN_REVIEW = 'IN_REVIEW',
  BUYER_APPROVED = 'BUYER_APPROVED',
  SELLER_APPROVED = 'SELLER_APPROVED',
  BOTH_APPROVED = 'BOTH_APPROVED',
  ADMIN_FINAL_REVIEW = 'ADMIN_FINAL_REVIEW',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  DISPUTED = 'DISPUTED'
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED'
}

export enum PaymentMethod {
  STRIPE = 'STRIPE',
  ZELLE = 'ZELLE',
  WIRE = 'WIRE',
  CHECK = 'CHECK'
}

export enum PaymentType {
  DEPOSIT = 'DEPOSIT',
  FINAL_PAYMENT = 'FINAL_PAYMENT',
  CREDIT_PURCHASE = 'CREDIT_PURCHASE',
  SUBSCRIPTION = 'SUBSCRIPTION',
  LISTING_FEE = 'LISTING_FEE',
  REFUND = 'REFUND'
}

export enum SubscriptionPlan {
  STARTER = 'STARTER',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE'
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  PAST_DUE = 'PAST_DUE'
}

export enum CreditTransactionType {
  PURCHASE = 'PURCHASE',
  USAGE = 'USAGE',
  REFUND = 'REFUND',
  BONUS = 'BONUS',
  EXPIRED = 'EXPIRED',
  SUBSCRIPTION = 'SUBSCRIPTION'
}

export enum NotificationType {
  OFFER = 'OFFER',
  MESSAGE = 'MESSAGE',
  VERIFICATION = 'VERIFICATION',
  REVIEW = 'REVIEW',
  TRANSACTION = 'TRANSACTION',
  SYSTEM = 'SYSTEM',
  PAYMENT = 'PAYMENT'
}

export enum PremiumRequestStatus {
  PENDING = 'PENDING',
  CONTACTED = 'CONTACTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

// ==================== INTERFACES ====================

interface UserAttributes {
  id: string;
  email: string;
  password: string;
  name: string;
  phone?: string;
  avatar?: string;
  role: UserRole;
  status: UserStatus;
  verified: boolean;
  verifiedAt?: Date;
  trustScore: number;
  memberSince: Date;
  lastLoginAt?: Date;
  companyName?: string;
  companyAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  ein?: string;
  sellerVerified: boolean;
  sellerVerifiedAt?: Date;
  totalCredits: number;
  usedCredits: number;
  stripeCustomerId?: string;
  emailVerified: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'phone' | 'avatar' | 'status' | 'verified' | 'verifiedAt' | 'trustScore' | 'memberSince' | 'lastLoginAt' | 'companyName' | 'companyAddress' | 'city' | 'state' | 'zipCode' | 'ein' | 'sellerVerified' | 'sellerVerifiedAt' | 'totalCredits' | 'usedCredits' | 'stripeCustomerId' | 'emailVerified' | 'createdAt' | 'updatedAt'> {}

// ==================== USER MODEL ====================

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: string;
  public email!: string;
  public password!: string;
  public name!: string;
  public phone?: string;
  public avatar?: string;
  public role!: UserRole;
  public status!: UserStatus;
  public verified!: boolean;
  public verifiedAt?: Date;
  public trustScore!: number;
  public memberSince!: Date;
  public lastLoginAt?: Date;
  public companyName?: string;
  public companyAddress?: string;
  public city?: string;
  public state?: string;
  public zipCode?: string;
  public ein?: string;
  public sellerVerified!: boolean;
  public sellerVerifiedAt?: Date;
  public totalCredits!: number;
  public usedCredits!: number;
  public stripeCustomerId?: string;
  public emailVerified!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Associations
  public readonly listings?: Listing[];
  public readonly sentOffers?: Offer[];
  public readonly receivedOffers?: Offer[];
  public readonly subscription?: Subscription;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    avatar: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    role: {
      type: DataTypes.ENUM(...Object.values(UserRole)),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(UserStatus)),
      defaultValue: UserStatus.ACTIVE,
    },
    verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    verifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    trustScore: {
      type: DataTypes.INTEGER,
      defaultValue: 50,
    },
    memberSince: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    companyName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    companyAddress: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    zipCode: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    ein: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    sellerVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    sellerVerifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    totalCredits: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    usedCredits: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    stripeCustomerId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    emailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'users',
    indexes: [
      { fields: ['email'] },
      { fields: ['role'] },
      { fields: ['status'] },
      { fields: ['stripeCustomerId'] },
    ],
  }
);

// ==================== REFRESH TOKEN MODEL ====================

export class RefreshToken extends Model {
  public id!: string;
  public token!: string;
  public userId!: string;
  public expiresAt!: Date;
  public readonly createdAt!: Date;
}

RefreshToken.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    token: {
      type: DataTypes.STRING(500),
      allowNull: false,
      unique: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'refresh_tokens',
    updatedAt: false,
    indexes: [
      { fields: ['userId'] },
      { fields: ['token'] },
    ],
  }
);

// ==================== PASSWORD RESET TOKEN MODEL ====================

export class PasswordResetToken extends Model {
  public id!: string;
  public token!: string;
  public tokenHash!: string;
  public userId!: string;
  public expiresAt!: Date;
  public usedAt?: Date;
  public readonly createdAt!: Date;

  // Associations
  public readonly user?: User;
}

PasswordResetToken.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    token: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    tokenHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'password_reset_tokens',
    updatedAt: false,
    indexes: [
      { fields: ['userId'] },
      { fields: ['token'] },
      { fields: ['tokenHash'] },
    ],
  }
);

// ==================== EMAIL VERIFICATION TOKEN MODEL ====================

export class EmailVerificationToken extends Model {
  public id!: string;
  public token!: string;
  public tokenHash!: string;
  public userId!: string;
  public email!: string;
  public expiresAt!: Date;
  public verifiedAt?: Date;
  public readonly createdAt!: Date;

  // Associations
  public readonly user?: User;
}

EmailVerificationToken.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    token: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    tokenHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    verifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'email_verification_tokens',
    updatedAt: false,
    indexes: [
      { fields: ['userId'] },
      { fields: ['token'] },
      { fields: ['tokenHash'] },
      { fields: ['email'] },
    ],
  }
);

// ==================== LISTING MODEL ====================

export class Listing extends Model {
  public id!: string;
  public mcNumber!: string;
  public dotNumber!: string;
  public legalName!: string;
  public dbaName?: string;
  public title!: string;
  public description?: string;
  public price!: number;
  public isPremium!: boolean;
  public status!: ListingStatus;
  public visibility!: ListingVisibility;
  public city!: string;
  public state!: string;
  public address?: string;
  public yearsActive!: number;
  public fleetSize!: number;
  public totalDrivers!: number;
  public safetyRating!: SafetyRating;
  public saferScore?: string;
  public insuranceOnFile!: boolean;
  public bipdCoverage?: number;
  public cargoCoverage?: number;
  public bondAmount?: number;
  public amazonStatus!: AmazonRelayStatus;
  public amazonRelayScore?: string;
  public highwaySetup!: boolean;
  public sellingWithEmail!: boolean;
  public sellingWithPhone!: boolean;
  public contactEmail?: string;
  public contactPhone?: string;
  public cargoTypes?: string;
  public fmcsaData?: string;
  public authorityHistory?: string;
  public insuranceHistory?: string;
  public views!: number;
  public saves!: number;
  public reviewNotes?: string;
  public rejectionReason?: string;
  public reviewedBy?: string;
  public reviewedAt?: Date;
  public publishedAt?: Date;
  public soldAt?: Date;
  public sellerId!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Associations
  public readonly seller?: User;
  public readonly documents?: Document[];
  public readonly offers?: Offer[];
}

Listing.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    mcNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    dotNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    legalName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    dbaName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    isPremium: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(ListingStatus)),
      defaultValue: ListingStatus.DRAFT,
    },
    visibility: {
      type: DataTypes.ENUM(...Object.values(ListingVisibility)),
      defaultValue: ListingVisibility.PUBLIC,
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    state: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    address: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    yearsActive: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    fleetSize: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    totalDrivers: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    safetyRating: {
      type: DataTypes.ENUM(...Object.values(SafetyRating)),
      defaultValue: SafetyRating.NONE,
    },
    saferScore: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    insuranceOnFile: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    bipdCoverage: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    cargoCoverage: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    bondAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    amazonStatus: {
      type: DataTypes.ENUM(...Object.values(AmazonRelayStatus)),
      defaultValue: AmazonRelayStatus.NONE,
    },
    amazonRelayScore: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    highwaySetup: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    sellingWithEmail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    sellingWithPhone: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    contactEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    contactPhone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    cargoTypes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    fmcsaData: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    authorityHistory: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    insuranceHistory: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    views: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    saves: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    reviewNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reviewedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    soldAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    sellerId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'listings',
    indexes: [
      { fields: ['mcNumber'] },
      { fields: ['dotNumber'] },
      { fields: ['sellerId'] },
      { fields: ['status'] },
      { fields: ['state'] },
      { fields: ['price'] },
      { fields: ['isPremium'] },
    ],
  }
);

// ==================== DOCUMENT MODEL ====================

export class Document extends Model {
  public id!: string;
  public type!: DocumentType;
  public name!: string;
  public url!: string;
  public size!: number;
  public mimeType!: string;
  public status!: DocumentStatus;
  public verifiedAt?: Date;
  public verifiedBy?: string;
  public listingId?: string;
  public transactionId?: string;
  public uploaderId!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Associations
  public readonly listing?: Listing;
  public readonly transaction?: Transaction;
  public readonly uploader?: User;
}

Document.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM(...Object.values(DocumentType)),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING(1000),
      allowNull: false,
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    mimeType: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(DocumentStatus)),
      defaultValue: DocumentStatus.PENDING,
    },
    verifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    verifiedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    listingId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    transactionId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    uploaderId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'documents',
    indexes: [
      { fields: ['listingId'] },
      { fields: ['transactionId'] },
      { fields: ['type'] },
    ],
  }
);

// ==================== OFFER MODEL ====================

export class Offer extends Model {
  public id!: string;
  public amount!: number;
  public message?: string;
  public status!: OfferStatus;
  public counterAmount?: number;
  public counterMessage?: string;
  public counterAt?: Date;
  public expiresAt?: Date;
  public respondedAt?: Date;
  public listingId!: string;
  public buyerId!: string;
  public sellerId!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Associations
  public readonly listing?: Listing;
  public readonly buyer?: User;
  public readonly seller?: User;
  public readonly transaction?: Transaction;
}

Offer.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(OfferStatus)),
      defaultValue: OfferStatus.PENDING,
    },
    counterAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    counterMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    counterAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    respondedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    listingId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    buyerId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    sellerId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'offers',
    indexes: [
      { fields: ['listingId'] },
      { fields: ['buyerId'] },
      { fields: ['sellerId'] },
      { fields: ['status'] },
    ],
  }
);

// ==================== TRANSACTION MODEL ====================

export class Transaction extends Model {
  public id!: string;
  public status!: TransactionStatus;
  public agreedPrice!: number;
  public depositAmount!: number;
  public platformFee?: number;
  public finalPaymentAmount?: number;
  public buyerApproved!: boolean;
  public buyerApprovedAt?: Date;
  public sellerApproved!: boolean;
  public sellerApprovedAt?: Date;
  public adminApproved!: boolean;
  public adminApprovedAt?: Date;
  public buyerAcceptedTerms!: boolean;
  public buyerAcceptedTermsAt?: Date;
  public sellerAcceptedTerms!: boolean;
  public sellerAcceptedTermsAt?: Date;
  public depositPaidAt?: Date;
  public depositPaymentMethod?: PaymentMethod;
  public depositPaymentRef?: string;
  public finalPaidAt?: Date;
  public finalPaymentMethod?: PaymentMethod;
  public finalPaymentRef?: string;
  public escrowStatus?: string;
  public escrowReleaseAt?: Date;
  public disputeReason?: string;
  public disputeOpenedAt?: Date;
  public disputeResolvedAt?: Date;
  public disputeResolution?: string;
  public buyerNotes?: string;
  public sellerNotes?: string;
  public adminNotes?: string;
  public completedAt?: Date;
  public cancelledAt?: Date;
  public listingId!: string;
  public offerId!: string;
  public buyerId!: string;
  public sellerId!: string;
  public adminId?: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Associations
  public readonly listing?: Listing;
  public readonly offer?: Offer;
  public readonly buyer?: User;
  public readonly seller?: User;
  public readonly admin?: User;
  public readonly documents?: Document[];
  public readonly messages?: TransactionMessage[];
  public readonly timeline?: TransactionTimeline[];
  public readonly payments?: Payment[];
}

Transaction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(TransactionStatus)),
      defaultValue: TransactionStatus.AWAITING_DEPOSIT,
    },
    agreedPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    depositAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    platformFee: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    finalPaymentAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    buyerApproved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    buyerApprovedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    sellerApproved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    sellerApprovedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    adminApproved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    adminApprovedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    buyerAcceptedTerms: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    buyerAcceptedTermsAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    sellerAcceptedTerms: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    sellerAcceptedTermsAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    depositPaidAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    depositPaymentMethod: {
      type: DataTypes.ENUM(...Object.values(PaymentMethod)),
      allowNull: true,
    },
    depositPaymentRef: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    finalPaidAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    finalPaymentMethod: {
      type: DataTypes.ENUM(...Object.values(PaymentMethod)),
      allowNull: true,
    },
    finalPaymentRef: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    escrowStatus: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    escrowReleaseAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    disputeReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    disputeOpenedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    disputeResolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    disputeResolution: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    buyerNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    sellerNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    adminNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    listingId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    offerId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
    },
    buyerId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    sellerId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'transactions',
    indexes: [
      { fields: ['listingId'] },
      { fields: ['buyerId'] },
      { fields: ['sellerId'] },
      { fields: ['status'] },
    ],
  }
);

// ==================== TRANSACTION MESSAGE MODEL ====================

export class TransactionMessage extends Model {
  public id!: string;
  public content!: string;
  public senderRole!: UserRole;
  public senderId!: string;
  public transactionId!: string;
  public readonly createdAt!: Date;
}

TransactionMessage.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    senderRole: {
      type: DataTypes.ENUM(...Object.values(UserRole)),
      allowNull: false,
    },
    senderId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    transactionId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'transaction_messages',
    updatedAt: false,
    indexes: [{ fields: ['transactionId'] }],
  }
);

// ==================== TRANSACTION TIMELINE MODEL ====================

export class TransactionTimeline extends Model {
  public id!: string;
  public status!: TransactionStatus;
  public title!: string;
  public description?: string;
  public actorId?: string;
  public actorRole?: UserRole;
  public transactionId!: string;
  public readonly createdAt!: Date;
}

TransactionTimeline.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(TransactionStatus)),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    actorId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    actorRole: {
      type: DataTypes.ENUM(...Object.values(UserRole)),
      allowNull: true,
    },
    transactionId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'transaction_timeline',
    updatedAt: false,
    indexes: [{ fields: ['transactionId'] }],
  }
);

// ==================== PAYMENT MODEL ====================

export class Payment extends Model {
  public id!: string;
  public type!: PaymentType;
  public amount!: number;
  public status!: PaymentStatus;
  public method?: PaymentMethod;
  public stripePaymentId?: string;
  public stripeIntentId?: string;
  public reference?: string;
  public verifiedBy?: string;
  public verifiedAt?: Date;
  public description?: string;
  public metadata?: string;
  public completedAt?: Date;
  public transactionId?: string;
  public userId?: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Payment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM(...Object.values(PaymentType)),
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(PaymentStatus)),
      defaultValue: PaymentStatus.PENDING,
    },
    method: {
      type: DataTypes.ENUM(...Object.values(PaymentMethod)),
      allowNull: true,
    },
    stripePaymentId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    stripeIntentId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    reference: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    verifiedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    verifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    transactionId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'payments',
    indexes: [
      { fields: ['transactionId'] },
      { fields: ['status'] },
      { fields: ['type'] },
    ],
  }
);

// ==================== REVIEW MODEL ====================

export class Review extends Model {
  public id!: string;
  public rating!: number;
  public comment?: string;
  public fromUserId!: string;
  public toUserId!: string;
  public dealId?: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Review.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 5 },
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    fromUserId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    toUserId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    dealId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'reviews',
    indexes: [
      { fields: ['toUserId'] },
      { unique: true, fields: ['fromUserId', 'toUserId', 'dealId'] },
    ],
  }
);

// ==================== SAVED LISTING MODEL ====================

export class SavedListing extends Model {
  public id!: string;
  public userId!: string;
  public listingId!: string;
  public readonly createdAt!: Date;

  // Associations
  public readonly user?: User;
  public readonly listing?: Listing;
}

SavedListing.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    listingId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'saved_listings',
    updatedAt: false,
    indexes: [
      { fields: ['userId'] },
      { fields: ['listingId'] },
      { unique: true, fields: ['userId', 'listingId'] },
    ],
  }
);

// ==================== UNLOCKED LISTING MODEL ====================

export class UnlockedListing extends Model {
  public id!: string;
  public creditsUsed!: number;
  public userId!: string;
  public listingId!: string;
  public readonly createdAt!: Date;

  // Associations
  public readonly user?: User;
  public readonly listing?: Listing;
}

UnlockedListing.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    creditsUsed: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    listingId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'unlocked_listings',
    updatedAt: false,
    indexes: [
      { fields: ['userId'] },
      { fields: ['listingId'] },
      { unique: true, fields: ['userId', 'listingId'] },
    ],
  }
);

// ==================== CREDIT TRANSACTION MODEL ====================

export class CreditTransaction extends Model {
  public id!: string;
  public type!: CreditTransactionType;
  public amount!: number;
  public balance!: number;
  public description?: string;
  public reference?: string;
  public userId!: string;
  public readonly createdAt!: Date;
}

CreditTransaction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM(...Object.values(CreditTransactionType)),
      allowNull: false,
    },
    amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    balance: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reference: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'credit_transactions',
    updatedAt: false,
    indexes: [
      { fields: ['userId'] },
      { fields: ['type'] },
    ],
  }
);

// ==================== SUBSCRIPTION MODEL ====================

export class Subscription extends Model {
  public id!: string;
  public plan!: SubscriptionPlan;
  public status!: SubscriptionStatus;
  public priceMonthly!: number;
  public priceYearly?: number;
  public isYearly!: boolean;
  public creditsPerMonth!: number;
  public creditsRemaining!: number;
  public stripeSubId?: string;
  public stripeCustomerId?: string;
  public startDate!: Date;
  public endDate?: Date;
  public renewalDate?: Date;
  public cancelledAt?: Date;
  public userId!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Associations
  public readonly user?: User;
}

Subscription.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    plan: {
      type: DataTypes.ENUM(...Object.values(SubscriptionPlan)),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(SubscriptionStatus)),
      defaultValue: SubscriptionStatus.ACTIVE,
    },
    priceMonthly: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    priceYearly: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    isYearly: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    creditsPerMonth: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    creditsRemaining: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    stripeSubId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    stripeCustomerId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    startDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    renewalDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
    },
  },
  {
    sequelize,
    tableName: 'subscriptions',
    indexes: [{ fields: ['status'] }],
  }
);

// ==================== MESSAGE MODEL ====================

export class Message extends Model {
  public id!: string;
  public content!: string;
  public read!: boolean;
  public readAt?: Date;
  public senderId!: string;
  public receiverId!: string;
  public listingId?: string;
  public readonly createdAt!: Date;

  // Associations
  public readonly sender?: User;
  public readonly receiver?: User;
  public readonly listing?: Listing;
}

Message.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    senderId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    receiverId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    listingId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'messages',
    updatedAt: false,
    indexes: [
      { fields: ['senderId'] },
      { fields: ['receiverId'] },
      { fields: ['read'] },
    ],
  }
);

// ==================== NOTIFICATION MODEL ====================

export class Notification extends Model {
  public id!: string;
  public type!: NotificationType;
  public title!: string;
  public message!: string;
  public read!: boolean;
  public readAt?: Date;
  public link?: string;
  public metadata?: string;
  public userId!: string;
  public readonly createdAt!: Date;
}

Notification.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM(...Object.values(NotificationType)),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    link: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'notifications',
    updatedAt: false,
    indexes: [
      { fields: ['userId'] },
      { fields: ['read'] },
      { fields: ['type'] },
    ],
  }
);

// ==================== PREMIUM REQUEST MODEL ====================

export class PremiumRequest extends Model {
  public id!: string;
  public status!: PremiumRequestStatus;
  public message?: string;
  public adminNotes?: string;
  public contactedAt?: Date;
  public contactedBy?: string;
  public buyerId!: string;
  public listingId!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

PremiumRequest.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(PremiumRequestStatus)),
      defaultValue: PremiumRequestStatus.PENDING,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    adminNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    contactedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    contactedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    buyerId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    listingId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'premium_requests',
    indexes: [
      { fields: ['status'] },
      { unique: true, fields: ['buyerId', 'listingId'] },
    ],
  }
);

// ==================== ADMIN ACTION MODEL ====================

export class AdminAction extends Model {
  public id!: string;
  public action!: string;
  public targetType!: string;
  public targetId!: string;
  public reason?: string;
  public metadata?: string;
  public adminId!: string;
  public readonly createdAt!: Date;
}

AdminAction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    targetType: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    targetId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'admin_actions',
    updatedAt: false,
    indexes: [
      { fields: ['adminId'] },
      { fields: ['targetType'] },
      { fields: ['targetId'] },
    ],
  }
);

// ==================== PLATFORM SETTING MODEL ====================

export class PlatformSetting extends Model {
  public id!: string;
  public key!: string;
  public value!: string;
  public type!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

PlatformSetting.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    key: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING(20),
      defaultValue: 'string',
    },
  },
  {
    sequelize,
    tableName: 'platform_settings',
  }
);

// ==================== ASSOCIATIONS ====================

// User associations
User.hasMany(Listing, { foreignKey: 'sellerId', as: 'listings' });
User.hasMany(Offer, { foreignKey: 'buyerId', as: 'sentOffers' });
User.hasMany(Offer, { foreignKey: 'sellerId', as: 'receivedOffers' });
User.hasMany(Transaction, { foreignKey: 'buyerId', as: 'buyerTransactions' });
User.hasMany(Transaction, { foreignKey: 'sellerId', as: 'sellerTransactions' });
User.hasMany(Transaction, { foreignKey: 'adminId', as: 'adminTransactions' });
User.hasMany(Review, { foreignKey: 'fromUserId', as: 'reviewsGiven' });
User.hasMany(Review, { foreignKey: 'toUserId', as: 'reviewsReceived' });
User.hasMany(SavedListing, { foreignKey: 'userId', as: 'savedListings' });
User.hasMany(UnlockedListing, { foreignKey: 'userId', as: 'unlockedListings' });
User.hasMany(CreditTransaction, { foreignKey: 'userId', as: 'creditHistory' });
User.hasOne(Subscription, { foreignKey: 'userId', as: 'subscription' });
User.hasMany(Message, { foreignKey: 'senderId', as: 'sentMessages' });
User.hasMany(Message, { foreignKey: 'receiverId', as: 'receivedMessages' });
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
User.hasMany(Document, { foreignKey: 'uploaderId', as: 'documents' });
User.hasMany(PremiumRequest, { foreignKey: 'buyerId', as: 'premiumRequests' });
User.hasMany(AdminAction, { foreignKey: 'adminId', as: 'adminActions' });
User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });

// RefreshToken associations
RefreshToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// PasswordResetToken associations
PasswordResetToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(PasswordResetToken, { foreignKey: 'userId', as: 'passwordResetTokens' });

// EmailVerificationToken associations
EmailVerificationToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(EmailVerificationToken, { foreignKey: 'userId', as: 'emailVerificationTokens' });

// Listing associations
Listing.belongsTo(User, { foreignKey: 'sellerId', as: 'seller' });
Listing.hasMany(Document, { foreignKey: 'listingId', as: 'documents' });
Listing.hasMany(Offer, { foreignKey: 'listingId', as: 'offers' });
Listing.hasMany(Transaction, { foreignKey: 'listingId', as: 'transactions' });
Listing.hasMany(SavedListing, { foreignKey: 'listingId', as: 'savedBy' });
Listing.hasMany(UnlockedListing, { foreignKey: 'listingId', as: 'unlockedBy' });
Listing.hasMany(PremiumRequest, { foreignKey: 'listingId', as: 'premiumRequests' });

// Document associations
Document.belongsTo(Listing, { foreignKey: 'listingId', as: 'listing' });
Document.belongsTo(Transaction, { foreignKey: 'transactionId', as: 'transaction' });
Document.belongsTo(User, { foreignKey: 'uploaderId', as: 'uploader' });

// Offer associations
Offer.belongsTo(Listing, { foreignKey: 'listingId', as: 'listing' });
Offer.belongsTo(User, { foreignKey: 'buyerId', as: 'buyer' });
Offer.belongsTo(User, { foreignKey: 'sellerId', as: 'seller' });
Offer.hasOne(Transaction, { foreignKey: 'offerId', as: 'transaction' });

// Transaction associations
Transaction.belongsTo(Listing, { foreignKey: 'listingId', as: 'listing' });
Transaction.belongsTo(Offer, { foreignKey: 'offerId', as: 'offer' });
Transaction.belongsTo(User, { foreignKey: 'buyerId', as: 'buyer' });
Transaction.belongsTo(User, { foreignKey: 'sellerId', as: 'seller' });
Transaction.belongsTo(User, { foreignKey: 'adminId', as: 'admin' });
Transaction.hasMany(Document, { foreignKey: 'transactionId', as: 'documents' });
Transaction.hasMany(TransactionMessage, { foreignKey: 'transactionId', as: 'messages' });
Transaction.hasMany(TransactionTimeline, { foreignKey: 'transactionId', as: 'timeline' });
Transaction.hasMany(Payment, { foreignKey: 'transactionId', as: 'payments' });

// TransactionMessage associations
TransactionMessage.belongsTo(Transaction, { foreignKey: 'transactionId', as: 'transaction' });

// TransactionTimeline associations
TransactionTimeline.belongsTo(Transaction, { foreignKey: 'transactionId', as: 'transaction' });

// Payment associations
Payment.belongsTo(Transaction, { foreignKey: 'transactionId', as: 'transaction' });

// Review associations
Review.belongsTo(User, { foreignKey: 'fromUserId', as: 'fromUser' });
Review.belongsTo(User, { foreignKey: 'toUserId', as: 'toUser' });

// SavedListing associations
SavedListing.belongsTo(User, { foreignKey: 'userId', as: 'user' });
SavedListing.belongsTo(Listing, { foreignKey: 'listingId', as: 'listing' });

// UnlockedListing associations
UnlockedListing.belongsTo(User, { foreignKey: 'userId', as: 'user' });
UnlockedListing.belongsTo(Listing, { foreignKey: 'listingId', as: 'listing' });

// CreditTransaction associations
CreditTransaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Subscription associations
Subscription.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Message associations
Message.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
Message.belongsTo(User, { foreignKey: 'receiverId', as: 'receiver' });

// Notification associations
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// PremiumRequest associations
PremiumRequest.belongsTo(User, { foreignKey: 'buyerId', as: 'buyer' });
PremiumRequest.belongsTo(Listing, { foreignKey: 'listingId', as: 'listing' });

// AdminAction associations
AdminAction.belongsTo(User, { foreignKey: 'adminId', as: 'admin' });

// Export all models
export {
  sequelize,
};

export default {
  User,
  RefreshToken,
  PasswordResetToken,
  EmailVerificationToken,
  Listing,
  Document,
  Offer,
  Transaction,
  TransactionMessage,
  TransactionTimeline,
  Payment,
  Review,
  SavedListing,
  UnlockedListing,
  CreditTransaction,
  Subscription,
  Message,
  Notification,
  PremiumRequest,
  AdminAction,
  PlatformSetting,
  sequelize,
};
