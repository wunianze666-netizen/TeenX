export type DemoPreparationStage = "team" | "arena" | "ready";

type DemoPreparationClient = {
  bootstrapDemo: () => Promise<unknown>;
  prepareDemoArena: () => Promise<unknown>;
};

export async function runDemoPreparation(
  client: DemoPreparationClient,
  onStage: (stage: DemoPreparationStage) => void,
) {
  onStage("team");
  await client.bootstrapDemo();
  onStage("arena");
  await client.prepareDemoArena();
  onStage("ready");
}
