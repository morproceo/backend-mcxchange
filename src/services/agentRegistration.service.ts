import { AgentCatalog, AgentCategory } from '../models';
import logger from '../utils/logger';

interface CatalogSeed {
  slug: string;
  name: string;
  description: string;
  category: AgentCategory;
  isAdminOnly: boolean;
  monthlyPrice?: number;
}

const SEEDS: CatalogSeed[] = [
  {
    slug: 'scout',
    name: 'Scout',
    description: 'Hunts and qualifies leads, enriches carrier data, and surfaces what to chase this week.',
    category: AgentCategory.INSIGHTS,
    isAdminOnly: true,
  },
  {
    slug: 'eva',
    name: 'Eva',
    description: 'Admin operator. Ask anything about leads, carriers, listings, or platform health — Eva calls the right tools and answers from real data.',
    category: AgentCategory.ORCHESTRATOR,
    isAdminOnly: true,
  },
  {
    slug: 'dia',
    name: 'Dia',
    description: 'AI compliance manager. Monitors fleet health, explains SMS scoring, alerts on document expirations, and suggests next actions.',
    category: AgentCategory.OPERATIONS,
    isAdminOnly: false, // visible to compliance_manager role + admins
  },
];

export async function seedAgentCatalog(): Promise<void> {
  for (const seed of SEEDS) {
    try {
      const [row, created] = await AgentCatalog.findOrCreate({
        where: { slug: seed.slug },
        defaults: {
          slug: seed.slug,
          name: seed.name,
          description: seed.description,
          category: seed.category,
          isActive: true,
          isAdminOnly: seed.isAdminOnly,
          monthlyPrice: seed.monthlyPrice ?? null,
        } as any,
      });
      if (created) {
        logger.info(`Seeded agent_catalog row: ${seed.slug}`);
      } else if (row.description !== seed.description || row.name !== seed.name) {
        await row.update({ description: seed.description, name: seed.name });
        logger.info(`Updated agent_catalog row: ${seed.slug}`);
      }
    } catch (err) {
      logger.warn(`seedAgentCatalog: failed for ${seed.slug}`, { error: (err as Error).message });
    }
  }
}
