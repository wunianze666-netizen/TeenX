import { createBrowserRouter, Outlet } from "react-router-dom";
import { CaptainProvider } from "./components/Captain";
import { ActivityPage } from "./pages/ActivityPage";
import { AddMemberPage } from "./pages/AddMemberPage";
import { ArenaChallengePage } from "./pages/ArenaChallengePage";
import { ArenaChallengesPage } from "./pages/ArenaChallengesPage";
import { ArenaResultPage } from "./pages/ArenaResultPage";
import { ArenaRunPage } from "./pages/ArenaRunPage";
import { CaptainProfilePage } from "./pages/CaptainProfilePage";
import { ContactsPage } from "./pages/ContactsPage";
import { DemoEntryPage } from "./pages/DemoEntryPage";
import { ForumPage } from "./pages/ForumPage";
import { LandingPage } from "./pages/LandingPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { MePage } from "./pages/MePage";
import { MemberPage } from "./pages/MemberPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StudioPage } from "./pages/StudioPage";
import { TestRunLaunchPage } from "./pages/TestRunLaunchPage";
import { TestRunResultPage } from "./pages/TestRunResultPage";
import { VersionsPage } from "./pages/VersionsPage";

function CaptainLayout() {
  return (
    <CaptainProvider>
      <Outlet />
    </CaptainProvider>
  );
}

export function createAppRouter() {
  return createBrowserRouter([
    { path: "/", element: <LandingPage /> },
    { path: "/demo", element: <DemoEntryPage /> },
    {
      element: <CaptainLayout />,
      children: [
        { path: "/studio", element: <StudioPage /> },
        { path: "/members/:memberId", element: <MemberPage /> },
        { path: "/members/new", element: <AddMemberPage /> },
        { path: "/test-run", element: <TestRunLaunchPage /> },
        { path: "/test-run/:runId", element: <TestRunResultPage /> },
        { path: "/versions", element: <VersionsPage /> },
        { path: "/activity", element: <ActivityPage /> },
        { path: "/forum", element: <ForumPage /> },
        { path: "/leaderboard", element: <LeaderboardPage /> },
        { path: "/me", element: <MePage /> },
        { path: "/me/settings", element: <SettingsPage /> },
        { path: "/me/contacts", element: <ContactsPage /> },
        { path: "/captains/:publicId", element: <CaptainProfilePage /> },
        { path: "/arena", element: <ArenaChallengesPage /> },
        { path: "/arena/challenges/:challengeVersionId", element: <ArenaChallengePage /> },
        { path: "/arena/runs/:runId", element: <ArenaRunPage /> },
        { path: "/arena/runs/:runId/result", element: <ArenaResultPage /> },
      ],
    },
  ]);
}
