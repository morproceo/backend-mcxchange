import scoutAgent from '../agents/scout/ScoutAgent';
import sequelize from '../config/database';

(async () => {
  await sequelize.authenticate();
  console.log('Calling LLM via BaseAgent.callLLM …');
  const res = await scoutAgent.callLLM(
    {
      promptType: 'sanity_check',
      system: 'You respond with exactly one short sentence.',
      messages: [{ role: 'user', content: 'Confirm you can hear me by saying you can.' }],
      model: 'gpt-4o-mini',
      maxTokens: 40,
      jsonMode: false,
    },
    { userId: null, role: 'ADMIN' }
  );
  console.log('---');
  console.log('Content:', res.content);
  console.log('Usage:', res.usage);
  console.log('InferenceId:', res.inferenceId);
  await sequelize.close();
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
