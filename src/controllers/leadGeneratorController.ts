import { Response } from 'express';
import { Op } from 'sequelize';
import { AuthRequest } from '../types';
import { LeadGeneratorSave, User, UserRole } from '../models';
import morproLinqService, { type LinqSearchFilters } from '../services/morproLinqService';
import { getLeadGeneratorAccess } from '../services/entitlementService';

// GET /api/lead-generator/access — authoritative access check for the UI.
// Resolves access purely from the user's subscription/entitlement, with NO
// dependency on the external carrier-data provider. The tool page gates on this
// so a data-provider outage (which makes /search return 502) can never make a
// paying subscriber look like they have no access. Always 200 for an
// authenticated user — { hasAccess:false, tier:null } when they lack a plan.
export async function getAccess(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Not authenticated.' });
  }
  const access = await getLeadGeneratorAccess(req.user.id, {
    isAdmin: req.user.role === UserRole.ADMIN,
  });
  return res.json({
    success: true,
    data: { hasAccess: access.hasAccess, tier: access.tier },
  });
}

// Buyer tier filters — anything not in this set is silently dropped for BUYER
// callers so the client can't sneak in advanced filters by hand-rolling the URL.
const BUYER_FILTER_KEYS = new Set([
  'state',
  'authorityStatus',
  'safetyRating',
  'name',
  'insuranceExpiresWithinDays',
]);

// Broker / Admin tiers get these on top of the buyer set.
const BROKER_FILTER_KEYS = new Set([
  ...BUYER_FILTER_KEYS,
  'minFleet',
  'maxFleet',
  'cargoType',
  'addedBefore',
  'addedAfter',
]);

function parseInt10(v: unknown, fallback: number): number {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function isoDateOffset(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function filterByTier(
  raw: Record<string, unknown>,
  tier: 'BUYER' | 'BROKER' | 'ADMIN'
): Record<string, unknown> {
  const allowed = tier === 'BUYER' ? BUYER_FILTER_KEYS : BROKER_FILTER_KEYS;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

function buildLinqFilters(q: Record<string, unknown>): LinqSearchFilters {
  const f: LinqSearchFilters = {};
  if (q.state) f.state = String(q.state).toUpperCase();
  if (q.authorityStatus) f.status = String(q.authorityStatus).toUpperCase();
  if (q.safetyRating) f.safety_rating = String(q.safetyRating);
  if (q.name) f.name_contains = String(q.name);
  if (q.minFleet) f.min_fleet_size = parseInt10(q.minFleet, 0);
  if (q.maxFleet) f.max_fleet_size = parseInt10(q.maxFleet, Number.MAX_SAFE_INTEGER);
  if (q.cargoType) f.cargo_type = String(q.cargoType);
  if (q.addedBefore) f.added_before = String(q.addedBefore);
  if (q.addedAfter) f.added_after = String(q.addedAfter);
  if (q.insuranceExpiresWithinDays) {
    const days = parseInt10(q.insuranceExpiresWithinDays, 30);
    f.insurance_cancels_after = isoDateOffset(0);
    f.insurance_cancels_before = isoDateOffset(days);
    f.has_active_insurance = true;
  }
  return f;
}

// GET /api/lead-generator/search
export async function searchCarriers(req: AuthRequest, res: Response) {
  const tier = req.leadGenTier ?? 'BUYER';
  const page = Math.max(1, parseInt10(req.query.page, 1));
  const limit = Math.min(100, Math.max(1, parseInt10(req.query.limit, 25)));

  const allowedRaw = filterByTier(req.query as Record<string, unknown>, tier);
  const userFilters = buildLinqFilters(allowedRaw);
  const filters: LinqSearchFilters = {
    ...(Object.keys(userFilters).length === 0 ? { status: 'ACTIVE' } : userFilters),
    page,
    limit,
  };

  const result = await morproLinqService.searchCarriers(filters);
  if (!result) {
    return res.status(502).json({ success: false, error: 'Carrier search unavailable' });
  }

  const carriers = (result.carriers || []).map((c) => ({
    dotNumber: String(c.dot_number),
    legalName: c.legal_name,
    dba: (c as any).dba_name || null,
    state: c.state,
    totalPowerUnits: c.power_units,
    totalDrivers: (c as any).drivers || null,
    authorityStatus: c.status,
    safetyRating: c.safety_rating,
  }));

  res.json({
    success: true,
    data: {
      carriers,
      page: result.page ?? page,
      limit: result.limit ?? limit,
      hasMore: !!result.has_more,
      tier,
    },
  });
}

// GET /api/lead-generator/carrier/:dot/contact — phone/email for one carrier.
// Available to ANY Lead Generator tier (Buyer + Broker) so subscribers can call
// a lead directly. Phone is NOT in the search response (kept light for speed);
// it lives on the per-carrier LINQ detail record, so we fetch it on demand here.
export async function getCarrierContact(req: AuthRequest, res: Response) {
  const dot = String(req.params.dot || '').trim();
  if (!dot) {
    return res.status(400).json({ success: false, error: 'dot is required' });
  }

  if (!morproLinqService.isConfigured()) {
    return res.status(502).json({ success: false, error: 'Carrier data unavailable' });
  }

  const carrier = (await morproLinqService.getCarrier(dot)) as any;
  if (!carrier) {
    return res.status(404).json({ success: false, error: 'Carrier not found' });
  }

  res.json({
    success: true,
    data: {
      dotNumber: dot,
      phone: carrier.phone || carrier.cell_phone || null,
      email: carrier.email || null,
    },
  });
}

// GET /api/lead-generator/saves — current user's own saves
export async function listSaves(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated.' });
  const saves = await LeadGeneratorSave.findAll({
    where: { userId: req.user.id },
    order: [['createdAt', 'DESC']],
  });
  res.json({ success: true, data: saves });
}

// POST /api/lead-generator/saves
export async function createSave(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated.' });
  const { dotNumber, carrierName, carrierStateCode, notes } = req.body || {};
  if (!dotNumber) {
    return res.status(400).json({ success: false, error: 'dotNumber is required' });
  }

  const [save, created] = await LeadGeneratorSave.findOrCreate({
    where: { userId: req.user.id, dotNumber: String(dotNumber) },
    defaults: {
      userId: req.user.id,
      dotNumber: String(dotNumber),
      carrierName: carrierName ?? null,
      carrierStateCode: carrierStateCode ?? null,
      notes: notes ?? null,
    } as any,
  });

  if (!created && (carrierName || carrierStateCode || notes != null)) {
    await save.update({
      carrierName: carrierName ?? save.carrierName,
      carrierStateCode: carrierStateCode ?? save.carrierStateCode,
      notes: notes ?? save.notes,
    });
  }

  res.status(created ? 201 : 200).json({ success: true, data: save });
}

// DELETE /api/lead-generator/saves/:id
export async function deleteSave(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated.' });
  const row = await LeadGeneratorSave.findOne({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!row) return res.status(404).json({ success: false, error: 'Save not found' });
  await row.destroy();
  res.json({ success: true });
}

// Bounded-concurrency map so enrichment doesn't fire hundreds of LINQ calls at once.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (i < items.length) {
      const cur = i++;
      results[cur] = await fn(items[cur]);
    }
  });
  await Promise.all(workers);
  return results;
}

const BASE_CSV_COLUMNS = [
  'dot_number',
  'legal_name',
  'dba',
  'state',
  'total_power_units',
  'total_drivers',
  'authority_status',
  'safety_rating',
];

function rowFromCarrier(c: any): Record<string, unknown> {
  return {
    dot_number: c.dot_number,
    legal_name: c.legal_name,
    dba: c.dba_name || '',
    state: c.state,
    total_power_units: c.power_units,
    total_drivers: c.drivers || '',
    authority_status: c.status,
    safety_rating: c.safety_rating,
  };
}

// GET /api/lead-generator/export.csv — available to any Lead Generator tier.
//   Buyer ($49): downloads the current page only (25 carriers), core columns.
//   Broker/Admin: downloads the full result set (paginated up to maxRows) and
//   enriches each row with phone + email (fetched per-carrier from LINQ).
export async function exportCsv(req: AuthRequest, res: Response) {
  const tier = req.leadGenTier ?? 'BUYER';
  const isBrokerTier = tier === 'BROKER' || tier === 'ADMIN';

  const allowedRaw = filterByTier(req.query as Record<string, unknown>, tier);
  const baseFilters = buildLinqFilters(allowedRaw);

  const collected: Array<Record<string, unknown>> = [];

  if (!isBrokerTier) {
    // Buyer: just the page they're viewing (25 rows).
    const page = Math.max(1, parseInt10(req.query.page, 1));
    const result = await morproLinqService.searchCarriers({ ...baseFilters, page, limit: 25 });
    if (!result) {
      return res.status(502).json({ success: false, error: 'Carrier search unavailable' });
    }
    for (const c of (result.carriers || []).slice(0, 25)) collected.push(rowFromCarrier(c));
  } else {
    // Broker/Admin: walk pages up to maxRows.
    const maxRows = Math.min(5000, Math.max(1, parseInt10(req.query.limit, 1000)));
    let page = 1;
    const pageSize = 100;
    while (collected.length < maxRows) {
      const filters: LinqSearchFilters = { ...baseFilters, page, limit: pageSize };
      const result = await morproLinqService.searchCarriers(filters);
      if (!result || (result.carriers || []).length === 0) break;
      const remaining = maxRows - collected.length;
      for (const c of (result.carriers || []).slice(0, remaining)) {
        collected.push({ ...rowFromCarrier(c), phone: '', email: '' });
      }
      if (!result.has_more) break;
      page++;
    }

    // Enrich with phone + email from the per-carrier LINQ detail (not in search).
    const contacts = await mapLimit(collected, 12, async (row) => {
      try {
        const d = (await morproLinqService.getCarrier(String(row.dot_number))) as any;
        return { phone: d?.phone || d?.cell_phone || '', email: d?.email || '' };
      } catch {
        return { phone: '', email: '' };
      }
    });
    contacts.forEach((c, idx) => {
      collected[idx].phone = c.phone;
      collected[idx].email = c.email;
    });
  }

  const headers = isBrokerTier ? [...BASE_CSV_COLUMNS, 'phone', 'email'] : BASE_CSV_COLUMNS;
  const escape = (v: unknown) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of collected) {
    lines.push(headers.map((h) => escape(r[h])).join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="lead-generator-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.send(lines.join('\n'));
}

// GET /api/admin/lead-generator/saves — admin only, all users' saves
export async function adminListAllSaves(req: AuthRequest, res: Response) {
  const userId = req.query.userId ? String(req.query.userId) : undefined;
  const dotNumber = req.query.dotNumber ? String(req.query.dotNumber) : undefined;
  const fromRaw = req.query.from ? String(req.query.from) : undefined;
  const toRaw = req.query.to ? String(req.query.to) : undefined;
  const page = Math.max(1, parseInt10(req.query.page, 1));
  const limit = Math.min(200, Math.max(1, parseInt10(req.query.limit, 50)));

  const where: Record<string, unknown> = {};
  if (userId) where.userId = userId;
  if (dotNumber) where.dotNumber = dotNumber;
  if (fromRaw || toRaw) {
    const range: Record<symbol, Date> = {};
    if (fromRaw) range[Op.gte] = new Date(fromRaw);
    if (toRaw) range[Op.lte] = new Date(toRaw);
    (where as any).createdAt = range;
  }

  const { rows, count } = await LeadGeneratorSave.findAndCountAll({
    where: where as any,
    order: [['createdAt', 'DESC']],
    offset: (page - 1) * limit,
    limit,
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'], required: false }],
  });

  res.json({
    success: true,
    data: {
      saves: rows,
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  });
}
