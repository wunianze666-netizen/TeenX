export type MeSummary = {
  readonly profile: {
    readonly publicId: string;
    readonly nickname: string;
    readonly joinedAt: string | null;
    readonly authMode: "local_fixture" | "signed_in";
  };
  readonly team: {
    readonly name: string;
    readonly memberCount: number;
    readonly versionCount: number;
  } | null;
  readonly stats: { readonly testRunCount: number };
};

export type IdentityInput = { readonly nickname: string };

export type UpdatedIdentity = {
  readonly profile: {
    readonly publicId: string;
    readonly nickname: string;
    readonly joinedAt: string | null;
  };
};

export type ProfilePrivacy = {
  readonly showTeam: boolean;
  readonly showForumActivity: boolean;
  readonly acceptDmRequests: boolean;
};

export type ContactState =
  | "self"
  | "unavailable"
  | "closed"
  | "available"
  | "outgoing_pending"
  | "incoming_pending"
  | "approved"
  | "blocked";

export type ViewerActions = {
  readonly isSelf: boolean;
  readonly contactState: ContactState;
  readonly canRequestDm: boolean;
  readonly canRespond: boolean;
  readonly canMessage: boolean;
  readonly canBlock: boolean;
  readonly canUnblock: boolean;
  readonly requestId: string | null;
  readonly forumMessagePath: string | null;
};

export type AdvxCaptainProfile = {
  readonly profile: {
    readonly publicId: string;
    readonly nickname: string;
    readonly avatarPath: string | null;
    readonly joinedAt: string | null;
  };
  readonly team?: {
    readonly name: string;
    readonly memberCount: number;
    readonly versionCount: number;
  };
  readonly forum?: {
    readonly username: string;
    readonly topicCount: number;
    readonly recentTopics: readonly {
      readonly id: string;
      readonly title: string;
      readonly createdAt: string;
      readonly path: string;
    }[];
  };
  readonly viewerActions: ViewerActions;
};

export type ContactCounterpart = {
  readonly publicId: string;
  readonly nickname: string;
  readonly avatarPath: string | null;
};

export type ContactRequestSummary = {
  readonly requestId: string;
  readonly direction: "incoming" | "outgoing";
  readonly state: "pending" | "accepted" | "declined" | "revoked" | "expired";
  readonly counterpart: ContactCounterpart;
  readonly createdAt: string;
  readonly expiresAt: string;
};

export type ContactGrantSummary = {
  readonly counterpart: ContactCounterpart;
  readonly state: "approved" | "blocked" | "unavailable";
  readonly establishedAt: string | null;
  readonly canMessage: boolean;
  readonly canSever: boolean;
  readonly canBlock: boolean;
  readonly canUnblock: boolean;
};

export type ContactPage<T> = {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
};

export type ContactMutationResponse = {
  readonly ok: true;
  readonly viewerActions?: ViewerActions;
  readonly request?: ContactRequestSummary;
  readonly grant?: ContactGrantSummary;
};

export type ContactRequestBox = "inbox" | "sent";
export type ContactDecision = "accept" | "decline";
export type ContactAction = "sever" | "block";
