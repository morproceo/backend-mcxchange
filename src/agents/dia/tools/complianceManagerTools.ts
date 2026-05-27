import { Op } from 'sequelize';
import {
  ManagedCompany, CarrierSnapshot, CarrierChangeEvent,
  ComplianceDocument, Driver, DriverDocument,
} from '../../../models';
import type { ToolDef } from '../../core/types';

// Tool set scoped to a compliance_manager user. All reads scope to ctx.userId.
export function buildComplianceManagerTools(): ToolDef[] {
  return [
    {
      schema: {
        type: 'function',
        function: {
          name: 'get_my_companies',
          description: 'List every carrier the compliance manager is currently tracking, with snapshot summary fields.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      handler: async (_args, ctx) => {
        if (!ctx.userId) return { error: 'no user' };
        const rows = await ManagedCompany.findAll({
          where: { userId: ctx.userId },
          include: [{
            model: CarrierSnapshot, as: 'snapshot',
            attributes: ['lastFetchedAt', 'legalName', 'operatingStatus', 'safetyRating', 'powerUnits', 'totalDrivers', 'state', 'earliestCancellationDate', 'chameleonRiskLevel', 'chameleonScore', 'driverOosRate', 'vehicleOosRate'],
          }],
          order: [['createdAt', 'DESC']],
        });
        return { count: rows.length, companies: rows };
      },
    },

    {
      schema: {
        type: 'function',
        function: {
          name: 'get_company_health',
          description: 'Full cached LINQ snapshot for one company (SMS BASICs, insurance, fleet, chameleon, etc.). Use this after get_my_companies to drill in.',
          parameters: {
            type: 'object',
            properties: {
              companyId: { type: 'string', description: 'ManagedCompany.id' },
              dotNumber: { type: 'string', description: 'Or DOT number — either works' },
            },
            additionalProperties: false,
          },
        },
      },
      handler: async (args: any, ctx) => {
        if (!ctx.userId) return { error: 'no user' };
        const where: any = { userId: ctx.userId };
        if (args.companyId) where.id = args.companyId;
        else if (args.dotNumber) where.dotNumber = String(args.dotNumber);
        else return { error: 'Provide companyId or dotNumber' };
        const company = await ManagedCompany.findOne({
          where,
          include: [{ model: CarrierSnapshot, as: 'snapshot' }],
        });
        if (!company) return { error: 'Company not found' };
        const snap: any = (company as any).snapshot;
        if (!snap) return { error: 'Snapshot not yet refreshed — try the Refresh button on the company workspace.' };
        return {
          company: { id: company.id, dotNumber: company.dotNumber, label: company.label },
          snapshotAt: snap.lastFetchedAt,
          report: snap.payloadJson,
        };
      },
    },

    {
      schema: {
        type: 'function',
        function: {
          name: 'list_expiring_documents',
          description: 'Documents (company-level + driver-level combined) sorted by earliest expiry across all managed companies.',
          parameters: {
            type: 'object',
            properties: {
              withinDays: { type: 'integer', description: 'Only include documents expiring in the next N days (default 60)' },
              includeExpired: { type: 'boolean', description: 'Include already-expired documents (default true)' },
            },
            additionalProperties: false,
          },
        },
      },
      handler: async (args: any, ctx) => {
        if (!ctx.userId) return { error: 'no user' };
        const within = typeof args.withinDays === 'number' ? args.withinDays : 60;
        const today = new Date().toISOString().slice(0, 10);
        const horizon = new Date(Date.now() + within * 86_400_000).toISOString().slice(0, 10);

        const companies = await ManagedCompany.findAll({ where: { userId: ctx.userId }, attributes: ['id', 'dotNumber', 'label'] });
        const companyIds = companies.map(c => c.id);
        if (companyIds.length === 0) return { companyDocs: [], driverDocs: [], total: 0 };

        const companyDocs = await ComplianceDocument.findAll({
          where: {
            managedCompanyId: { [Op.in]: companyIds },
            ...(args.includeExpired === false
              ? { expiresOn: { [Op.between]: [today, horizon] } }
              : { expiresOn: { [Op.lte]: horizon } }),
          } as any,
          order: [['expiresOn', 'ASC']],
          limit: 100,
        });

        const drivers = await Driver.findAll({
          where: { managedCompanyId: { [Op.in]: companyIds } },
          attributes: ['id', 'fullName', 'managedCompanyId'],
        });
        const driverIds = drivers.map(d => d.id);
        const driverById = new Map(drivers.map(d => [d.id, d]));
        const driverDocs = driverIds.length
          ? await DriverDocument.findAll({
              where: {
                driverId: { [Op.in]: driverIds },
                ...(args.includeExpired === false
                  ? { expiresOn: { [Op.between]: [today, horizon] } }
                  : { expiresOn: { [Op.lte]: horizon } }),
              } as any,
              order: [['expiresOn', 'ASC']],
              limit: 100,
            })
          : [];

        const companyById = new Map(companies.map(c => [c.id, c]));
        return {
          total: companyDocs.length + driverDocs.length,
          companyDocs: companyDocs.map(d => ({
            id: d.id, kind: d.kind, title: d.title, expiresOn: d.expiresOn,
            company: companyById.get((d as any).managedCompanyId),
          })),
          driverDocs: driverDocs.map(d => {
            const drv = driverById.get((d as any).driverId);
            return {
              id: d.id, kind: d.kind, title: d.title, expiresOn: d.expiresOn,
              driverName: drv?.fullName,
              company: drv ? companyById.get((drv as any).managedCompanyId) : null,
            };
          }),
        };
      },
    },

    {
      schema: {
        type: 'function',
        function: {
          name: 'get_company_changes',
          description: 'Recent change events for a company — what shifted in FMCSA/LINQ data between refreshes.',
          parameters: {
            type: 'object',
            properties: {
              companyId: { type: 'string' },
              severity: { type: 'string', enum: ['INFO', 'WARN', 'CRITICAL'] },
              limit: { type: 'integer' },
            },
            required: ['companyId'],
            additionalProperties: false,
          },
        },
      },
      handler: async (args: any, ctx) => {
        if (!ctx.userId) return { error: 'no user' };
        const company = await ManagedCompany.findOne({ where: { id: args.companyId, userId: ctx.userId } });
        if (!company) return { error: 'Company not found' };
        const where: any = { managedCompanyId: company.id };
        if (args.severity) where.severity = args.severity;
        const limit = Math.min(100, Math.max(1, args.limit || 25));
        const rows = await CarrierChangeEvent.findAll({ where, order: [['detectedAt', 'DESC']], limit });
        return { count: rows.length, changes: rows };
      },
    },

    {
      schema: {
        type: 'function',
        function: {
          name: 'get_drivers',
          description: 'List drivers across all managed companies, optionally filtered by status or company.',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'ONBOARDING', 'TERMINATED'] },
              companyId: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
      },
      handler: async (args: any, ctx) => {
        if (!ctx.userId) return { error: 'no user' };
        const companies = await ManagedCompany.findAll({ where: { userId: ctx.userId }, attributes: ['id', 'dotNumber', 'label'] });
        const ids = companies.map(c => c.id);
        if (ids.length === 0) return { count: 0, drivers: [] };
        const where: any = { managedCompanyId: { [Op.in]: ids } };
        if (args.status) where.status = args.status;
        if (args.companyId) where.managedCompanyId = args.companyId;
        const drivers = await Driver.findAll({ where, order: [['createdAt', 'DESC']], limit: 200 });
        return { count: drivers.length, drivers };
      },
    },
  ];
}
