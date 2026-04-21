import { AuthorityType } from '../models';

type MorProStatusBlock = {
  status?: string | null;
  grantedDate?: string | null;
  effectiveDate?: string | null;
};

type MorProAuthority = {
  statuses?: {
    common?: MorProStatusBlock;
    contract?: MorProStatusBlock;
    broker?: MorProStatusBlock;
  };
};

type FmcsaAuthorityFlat = {
  commonAuthorityStatus?: string | null;
  contractAuthorityStatus?: string | null;
  brokerAuthorityStatus?: string | null;
};

const isActive = (s?: string | null): boolean => !!s && /^(A|ACTIVE)$/i.test(s);

/**
 * Derive an AuthorityType from either a MorPro authority block (nested `statuses`)
 * or a flat FMCSA shape. If both carrier and broker authority are active, CARRIER
 * wins — the seller can override via the create-listing form.
 */
export function deriveAuthorityType(input: MorProAuthority | FmcsaAuthorityFlat | string | null | undefined): AuthorityType {
  if (!input) return AuthorityType.CARRIER;

  // Accept JSON strings (authorityHistory is persisted as TEXT)
  let parsed: MorProAuthority | FmcsaAuthorityFlat;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch {
      return AuthorityType.CARRIER;
    }
  } else {
    parsed = input;
  }

  const morPro = parsed as MorProAuthority;
  if (morPro.statuses) {
    const carrier = isActive(morPro.statuses.common?.status) || isActive(morPro.statuses.contract?.status);
    const broker = isActive(morPro.statuses.broker?.status);
    if (carrier) return AuthorityType.CARRIER;
    if (broker) return AuthorityType.BROKER;
    return AuthorityType.CARRIER;
  }

  const fmcsa = parsed as FmcsaAuthorityFlat;
  const carrier = isActive(fmcsa.commonAuthorityStatus) || isActive(fmcsa.contractAuthorityStatus);
  const broker = isActive(fmcsa.brokerAuthorityStatus);
  if (carrier) return AuthorityType.CARRIER;
  if (broker) return AuthorityType.BROKER;
  return AuthorityType.CARRIER;
}
