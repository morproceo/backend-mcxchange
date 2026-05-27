import { ComplianceDocument, DriverDocument, Driver, ManagedCompany, Notification, NotificationType, CarrierChangeEvent, CarrierChangeSeverity } from '../../models';
import { PolicyEngine } from '../core/PolicyEngine';
import logger from '../../utils/logger';

/**
 * Wires reactive expiry hooks for the compliance module. When a document is
 * added with expiresOn < N days (policy-controlled, default 30), Dia writes
 * a COMPLIANCE Notification to the compliance manager and a CarrierChangeEvent
 * scoped to the relevant company so it shows in the Pulse tab.
 */
export function installDiaHooks() {
  ComplianceDocument.addHook('afterCreate', async (doc: any) => {
    try {
      const expiresOn = doc.expiresOn ? String(doc.expiresOn).slice(0, 10) : null;
      if (!expiresOn) return;

      const company = await ManagedCompany.findByPk(doc.managedCompanyId);
      if (!company) return;

      const userId = company.userId;
      const windowDays = await PolicyEngine.getPolicy<number>(userId, 'dia', 'expiry_alert_window_days', 30);
      const enabled = await PolicyEngine.getPolicy<boolean>(userId, 'dia', 'auto_expiry_alerts_enabled', true);
      if (!enabled) return;

      const days = Math.ceil((new Date(expiresOn).getTime() - Date.now()) / 86_400_000);
      if (days > windowDays) return; // not urgent enough

      const severity: CarrierChangeSeverity =
        days < 0 ? CarrierChangeSeverity.CRITICAL
        : days <= 7 ? CarrierChangeSeverity.CRITICAL
        : days <= 30 ? CarrierChangeSeverity.WARN
        : CarrierChangeSeverity.INFO;

      const label = company.label || `DOT ${company.dotNumber}`;
      const headline = days < 0
        ? `${doc.kind.replace(/_/g, ' ')} for ${label} is EXPIRED`
        : `${doc.kind.replace(/_/g, ' ')} for ${label} expires in ${days} days`;

      await Promise.all([
        CarrierChangeEvent.create({
          managedCompanyId: company.id,
          field: `documents.${doc.kind}.expiresOn`,
          oldValue: null,
          newValue: expiresOn,
          severity,
          description: headline,
          detectedAt: new Date(),
          acknowledged: false,
        } as any),
        Notification.create({
          userId,
          type: NotificationType.COMPLIANCE,
          title: 'Compliance alert',
          message: `${headline}. ${doc.title || ''}`.trim(),
          read: false,
          link: `/compliance/companies/${company.id}`,
        } as any),
      ]);
    } catch (err) {
      logger.warn('Dia ComplianceDocument.afterCreate hook failed', { error: (err as Error).message });
    }
  });

  DriverDocument.addHook('afterCreate', async (doc: any) => {
    try {
      const expiresOn = doc.expiresOn ? String(doc.expiresOn).slice(0, 10) : null;
      if (!expiresOn) return;

      const driver = await Driver.findByPk(doc.driverId, {
        include: [{ model: ManagedCompany, as: 'company', attributes: ['id', 'userId', 'dotNumber', 'label'] }],
      });
      if (!driver) return;
      const company: any = (driver as any).company;
      if (!company) return;

      const userId = company.userId;
      const windowDays = await PolicyEngine.getPolicy<number>(userId, 'dia', 'expiry_alert_window_days', 30);
      const enabled = await PolicyEngine.getPolicy<boolean>(userId, 'dia', 'auto_expiry_alerts_enabled', true);
      if (!enabled) return;

      const days = Math.ceil((new Date(expiresOn).getTime() - Date.now()) / 86_400_000);
      if (days > windowDays) return;

      const severity: CarrierChangeSeverity =
        days < 0 ? CarrierChangeSeverity.CRITICAL
        : days <= 7 ? CarrierChangeSeverity.CRITICAL
        : days <= 30 ? CarrierChangeSeverity.WARN
        : CarrierChangeSeverity.INFO;

      const label = company.label || `DOT ${company.dotNumber}`;
      const headline = days < 0
        ? `${driver.fullName}'s ${doc.kind.replace(/_/g, ' ')} (${label}) is EXPIRED`
        : `${driver.fullName}'s ${doc.kind.replace(/_/g, ' ')} (${label}) expires in ${days} days`;

      await Promise.all([
        CarrierChangeEvent.create({
          managedCompanyId: company.id,
          field: `drivers.${driver.id}.documents.${doc.kind}.expiresOn`,
          oldValue: null,
          newValue: expiresOn,
          severity,
          description: headline,
          detectedAt: new Date(),
          acknowledged: false,
        } as any),
        Notification.create({
          userId,
          type: NotificationType.COMPLIANCE,
          title: 'Driver compliance alert',
          message: `${headline}. ${doc.title || ''}`.trim(),
          read: false,
          link: `/compliance/drivers/${driver.id}`,
        } as any),
      ]);
    } catch (err) {
      logger.warn('Dia DriverDocument.afterCreate hook failed', { error: (err as Error).message });
    }
  });

  // Also: when a CDL expiry is set on a driver and it's close, fire an alert.
  // We hook afterCreate + afterUpdate to catch both initial add and later edits.
  const driverExpiryHandler = async (driver: any) => {
    try {
      if (!driver.cdlExpiresOn) return;
      const expiresOn = String(driver.cdlExpiresOn).slice(0, 10);
      const company = await ManagedCompany.findByPk(driver.managedCompanyId);
      if (!company) return;

      const userId = company.userId;
      const windowDays = await PolicyEngine.getPolicy<number>(userId, 'dia', 'expiry_alert_window_days', 30);
      const enabled = await PolicyEngine.getPolicy<boolean>(userId, 'dia', 'auto_expiry_alerts_enabled', true);
      if (!enabled) return;

      const days = Math.ceil((new Date(expiresOn).getTime() - Date.now()) / 86_400_000);
      if (days > windowDays) return;

      const label = company.label || `DOT ${company.dotNumber}`;
      const severity: CarrierChangeSeverity =
        days < 0 ? CarrierChangeSeverity.CRITICAL
        : days <= 7 ? CarrierChangeSeverity.CRITICAL
        : CarrierChangeSeverity.WARN;
      const headline = days < 0
        ? `CDL for ${driver.fullName} (${label}) is EXPIRED`
        : `CDL for ${driver.fullName} (${label}) expires in ${days} days`;

      await Promise.all([
        CarrierChangeEvent.create({
          managedCompanyId: company.id,
          field: `drivers.${driver.id}.cdlExpiresOn`,
          oldValue: null,
          newValue: expiresOn,
          severity,
          description: headline,
          detectedAt: new Date(),
          acknowledged: false,
        } as any),
        Notification.create({
          userId,
          type: NotificationType.COMPLIANCE,
          title: 'CDL expiry alert',
          message: headline,
          read: false,
          link: `/compliance/drivers/${driver.id}`,
        } as any),
      ]);
    } catch (err) {
      logger.warn('Dia driver CDL hook failed', { error: (err as Error).message });
    }
  };

  Driver.addHook('afterCreate', driverExpiryHandler as any);
  Driver.addHook('afterUpdate', (driver: any) => {
    if (driver.changed('cdlExpiresOn')) return driverExpiryHandler(driver);
  });

  logger.info('Dia hooks installed (ComplianceDocument, DriverDocument, Driver CDL)');
}
