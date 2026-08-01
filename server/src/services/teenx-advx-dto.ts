type TeamInput = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: string;
  readonly memberCount: number;
  readonly versionCount: number;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
};

type ActivityInput = {
  readonly action: string;
  readonly entityType: string;
  readonly createdAt: Date | string;
};

type ProductInput = {
  readonly title: string;
  readonly type: string;
  readonly summary?: string | null;
};

type TestRunInput = {
  readonly run: {
    readonly status: string;
    readonly startedAt?: Date | string | null;
    readonly finishedAt?: Date | string | null;
    readonly resultSummary?: string | null;
  };
  readonly activity: readonly ActivityInput[];
  readonly products: readonly ProductInput[];
};

type VersionMemberInput = {
  readonly name: string;
  readonly roleTemplate: string | null;
  readonly responsibilities: string | null;
  readonly tools: readonly string[];
  readonly skills: readonly string[];
};

type VersionInput = {
  readonly id: string;
  readonly versionNumber: number;
  readonly label: string | null;
  readonly createdAt: string;
  readonly snapshot: {
    readonly teamName: string;
    readonly members: readonly VersionMemberInput[];
  };
};

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

export function toTeenxTeamView(input: TeamInput) {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    status: input.status,
    memberCount: input.memberCount,
    versionCount: input.versionCount,
    createdAt: iso(input.createdAt),
    updatedAt: iso(input.updatedAt),
  };
}

export function toTeenxActivityView(input: ActivityInput) {
  return {
    action: input.action,
    entityType: input.entityType,
    createdAt: iso(input.createdAt),
  };
}

export function toTeenxTestRunView(input: TestRunInput) {
  return {
    status: input.run.status,
    startedAt: input.run.startedAt ? iso(input.run.startedAt) : null,
    finishedAt: input.run.finishedAt ? iso(input.run.finishedAt) : null,
    resultSummary: input.run.resultSummary ?? null,
    activity: input.activity.map(toTeenxActivityView),
    products: input.products.map((product) => ({
      title: product.title,
      type: product.type,
      summary: product.summary ?? null,
    })),
  };
}

export function toTeenxVersionView(input: VersionInput) {
  return {
    id: input.id,
    versionNumber: input.versionNumber,
    label: input.label,
    createdAt: input.createdAt,
    snapshot: {
      teamName: input.snapshot.teamName,
      members: input.snapshot.members.map((member) => ({
        name: member.name,
        roleTemplate: member.roleTemplate,
        responsibilities: member.responsibilities,
        tools: [...member.tools],
        skills: [...member.skills],
      })),
    },
  };
}
