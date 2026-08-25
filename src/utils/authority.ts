import { AuthorityType } from '../models';

export const AUTHORITY_TYPE_VALUES: string[] = Object.values(AuthorityType);

/**
 * Authority types that legitimately have no USDOT number. Brokers and freight
 * forwarders register with FMCSA under a docket (MC) number only — many never
 * receive a USDOT because they don't operate commercial motor vehicles.
 */
export const DOT_OPTIONAL_AUTHORITY_TYPES: string[] = [
  AuthorityType.BROKER,
  AuthorityType.FREIGHT_FORWARDER,
];

// Normalize authority type to valid enum value, defaulting to MOTOR_CARRIER
export function normalizeAuthorityType(type: string | undefined | null): AuthorityType {
  if (!type) return AuthorityType.MOTOR_CARRIER;
  const normalized = type.toUpperCase().trim();
  if (normalized === AuthorityType.BROKER) return AuthorityType.BROKER;
  if (normalized === AuthorityType.MOTOR_CARRIER_AND_BROKER) return AuthorityType.MOTOR_CARRIER_AND_BROKER;
  if (normalized === AuthorityType.FREIGHT_FORWARDER) return AuthorityType.FREIGHT_FORWARDER;
  return AuthorityType.MOTOR_CARRIER;
}

/**
 * Whether a listing of this authority type must carry a DOT number.
 * Unknown/missing input normalizes to MOTOR_CARRIER, so legacy clients that
 * omit authorityType keep the original "DOT always required" behavior.
 */
export function requiresDotNumber(type: string | undefined | null): boolean {
  return !DOT_OPTIONAL_AUTHORITY_TYPES.includes(normalizeAuthorityType(type));
}

/** Does this authority actually operate trucks? Drives fleet/safety expectations. */
export function hasCarrierOperations(type: string | undefined | null): boolean {
  const normalized = normalizeAuthorityType(type);
  return (
    normalized === AuthorityType.MOTOR_CARRIER ||
    normalized === AuthorityType.MOTOR_CARRIER_AND_BROKER
  );
}
