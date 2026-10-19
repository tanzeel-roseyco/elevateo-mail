# Inherited baseline manifest (FE EmailGuard replica task)

Source checkout: C:/Users/Tanzeel/Code and projects/Elevateo Mail - Unified Dashboard 20261020 (branch feat/unified-inbox-marketing, HEAD ba2d7ebfc52726cc82fef793c9cb80922084f447).
Worktree HEAD before inheritance: ba2d7ebfc52726cc82fef793c9cb80922084f447.
Captured 2026-10-20 by copying the source working copy of every modified tracked file and every untracked first-party source file. No .git, node_modules, secrets, credentials or generated artifacts were copied. The source checkout was not modified.

Backend, contracts and marketing-run server code are inherited as received and NOT changed by this task (parked, unverified per coordinator).

| Status | Path | SHA-256 (working-copy bytes as copied) |
|---|---|---|
| M | README.md | a51acbea90a9479b729669d6516b5ee09b8c7faf272fab75bbdf8c369157303e |
| A | apps/server/app/controllers/v2/outreach/runs_controller.rb | 3fa98f00331812e63325f7b394b95503eb0cce9c4e3e576ea337564d10b9574e |
| M | apps/server/config/v2_route_registry.rb | 3c8e174b8f58af924f415caa7f24694b8d81104abddb2488f7bee67701a4949b |
| A | apps/server/db/be03_send/marketing_authority_v1.sql | dae43832790d6cd1bb9b2b60e9e321dc30421b36a06477a220c8101d3d1c54bd |
| A | apps/server/db/migrate/20261020000039_create_marketing_runs.rb | 96def7403359e105f7e3938312044df433116f2c5ba0fae5c933ea462dce6628 |
| A | apps/server/lib/elevateo/campaigns/run_input.rb | 64a47d7fdf4052b2412b0d7684272d9f1d4b1ab8503d170f1d322a52f52ff915 |
| A | apps/server/lib/elevateo/campaigns/runs.rb | d85bf079bfda2dc22c5e63d1033982d36b775adcab6092bd277f7915ec08fa81 |
| M | apps/server/lib/elevateo/send_api/canonical.rb | 25f9fd4a55d4d7c63c6b98a94824a4b953c327395484af59e0ede2eec4cf32e0 |
| M | apps/server/lib/elevateo/send_api/review.rb | 7313fcf912a1b05cf96aca0690b64544daf785fb3c146112dcb2e29ba9c39df4 |
| M | apps/server/lib/elevateo/send_worker/smtp_snapshot.rb | e36077ef510ee9654d6ac4026d372aec3fc263a27a9d74c5bd047bc730c831fd |
| M | apps/server/sig/campaigns.rbs | fbad28434f3e3050cb7847ca450bca2c766d3991c28d8797fc7fd1e0ed7431b6 |
| M | apps/server/sig/outreach_controllers.rbs | e874c39e95e05fc864bc46a2823133d96cf248393cb14963c6a34a1a63db9d99 |
| M | apps/server/sig/send_api.rbs | c57efa6905609c26d7676a712beceaf88e7882eb3b05b24686bad3dec82030e9 |
| A | apps/server/test/campaigns/marketing_review_test.rb | d1e92d05f84c6d4abce9c2f62bfbd087951f83cace69bb0c79571d13d5b8075b |
| A | apps/server/test/campaigns/run_input_test.rb | b539242ac92031f9ab63f130df61d705ec28f32fc282b9fa3a32c9c3f3b2a9c7 |
| A | apps/server/test/campaigns/runs_database_test.rb | 0abd6c96ca1fdcdc10919be4f9642cf623041ac95db86940e34d2ae78fab5f7a |
| M | apps/server/test/send_worker/smtp_snapshot_test.rb | 5f2f7185f328e749c302c3464db1619d48b374a0b005fbb6cba90116b75ad181 |
| M | apps/server/test/v2_route_registry_test.rb | 60d94ef49686302e663986b4657aa394db82f20ab755c99641d3d07f9e069315 |
| M | apps/web/src/app/App.tsx | 8d77e24a8cb84efd330c662fdc7c3315daf3760e5c5543f70b5445aaedb29a3b |
| A | apps/web/src/app/InboxWorkspace.test.tsx | 2504c653ec253f404b0cab5159032b035ee61430811aa9de1c8258734ce2f99f |
| A | apps/web/src/app/InboxWorkspace.tsx | d83cdca9a36ef21a8e06bc4ee98e576ebb7503f124c1471e7b8913bb49785a68 |
| M | apps/web/src/app/Shell.tsx | 55a44e10ae009326db5129daf19cede1541dab2b1cd1287949704f2ae26cc9d9 |
| M | apps/web/src/app/Sidebar.test.tsx | 74e1492a4b63a6f2871aa3527ac99b39b0e4e18f8cbcff45f4152b7a8215a9c8 |
| M | apps/web/src/app/Sidebar.tsx | 58b8138d47513d86324dde9730d4d1833cc29d74e404351b4d39f3e04c5cf0b6 |
| M | apps/web/src/app/pageMeta.test.ts | 3ba17becb18422465daaafa5dda925c0f0d24d4b5e5b302caf6643d7f557202c |
| M | apps/web/src/app/pageMeta.ts | f585dae406eeda3a9653445b8dc89ec8b8586fd15c1fdecdeadb70b14fee60ab |
| M | apps/web/src/data/contract-send.test.ts | 8d1e855da4bf4ec7653af5617af8875ee83f62f6199ba7ba1ae6baa9a3bb4a54 |
| M | apps/web/src/data/generated/api-v2.d.ts | 96d7a71ec69f8ca86c216384c8896928aede4dfaf17aa8b49f792b4ff7368d4f |
| M | apps/web/src/data/generated/api.d.ts | 1652002e21ff5860b5bc233af73984a886758dc1a226804efb2de488bd3c9e20 |
| M | apps/web/src/data/sendContract.ts | 203a13ed7f6e84a9a53d5ba871a3f9280612e1d395efe55ec13ff25028773c26 |
| A | apps/web/src/data/v2CampaignRunsGateway.test.ts | b45dd0860fc1ce5937b961ea307850feca973f75a78bf924499431175d20a020 |
| M | apps/web/src/data/v2OutreachGateway.ts | 564532edac710f6fa0e4099d6f6075da52a5c3e725fb8a2f46735b33bc3d2822 |
| M | apps/web/src/domain/sendConsent.test.ts | 58fce0aea2f042fe70893b9eb240f189c6175d7bbdd2094c90a943556089a4b6 |
| M | apps/web/src/domain/sendConsent.ts | de4de1560826b8985d1b87e35877d94228829410a7fc6be53edf70362be727d2 |
| M | apps/web/src/features/inbox/InboxPage.tsx | b578d871b41f7fa3963d7d6bc63dbb2641ba2ecd6d2983a2ff6feb763dd5573c |
| A | apps/web/src/features/outreach/CampaignOverview.test.tsx | 254963af0b9de2b8a1409ec56f50b275d57bddbcee0b4213171db1bcc30f23ad |
| A | apps/web/src/features/outreach/CampaignOverview.tsx | 2e740ffb143bd6c3687b8bb3ef92434b98476c5115c7d80d3dd6e89556c37369 |
| A | apps/web/src/features/outreach/CampaignRunsPage.test.tsx | b11dea7b7fb0e137cc66ac3f90426b68f8a2d3d78e725d0d0f0fe45de45e95c8 |
| A | apps/web/src/features/outreach/CampaignRunsPage.tsx | 5f2c6320c1b0f15d2369a841d3da9e20262adfaa0969c6f233d375709458ba37 |
| M | apps/web/src/features/outreach/OutreachPages.tsx | 395005773d0d6d6b6df9af515ecdbf926e0239a80ff634f5f01152c488a6c6c5 |
| A | apps/web/src/features/outreach/RunComposer.test.tsx | 61e1e70ee1b3e81ca489450e0581d4d52628542db64ea8f00e9d2d7a97262113 |
| A | apps/web/src/features/outreach/RunComposer.tsx | a07d7276ed21e7e1097f0453d9dea36958324357f257eb8f1cb202f1b6389188 |
| A | apps/web/src/features/outreach/RunIntent.test.tsx | 23be6be16189156f9deee9eb787a4e37cb3dadcfbeef93abe0694ad3884311f2 |
| A | apps/web/src/features/outreach/RunIntent.tsx | 0231d98fbcc84de6688ab4a31af72890f1a4dc8b344cec55d1a0473045894c1e |
| M | apps/web/src/features/outreach/contract.ts | ffa2d969285e378f426058d3d7c9d7d66254e6f3a7de7004a246e7b22d7d5526 |
| A | apps/web/src/features/outreach/runContract.ts | 64b0d6be935fdf997d3b55a95fc49e2ba49b3d3af6f5685bd07d34bcc672f1b4 |
| M | apps/web/src/features/send/SendReviewPage.test.tsx | 584492d3d5b72154b3e39f53e3ddb79355e35c197fa7ae3efe01e59ec67ea304 |
| M | apps/web/src/features/send/SendReviewPage.tsx | 46e990c1a0798611b55e8e92c78ff054bc68950b7200ea2d5fed9f7f10a3c23b |
| M | apps/web/src/styles/index.css | c128a16d1d834abb72259fce07cd7913861157697aadf0c6a82cfb48457f447a |
| M | code-reviews.md | 7b95c569793d44f62b696329f7ff2135ffce10780a3f704fa40b4cd7aaf232cf |
| M | contracts/v1/openapi.json | 3d6075211b797a217f7bf85040969ca6db456327514526ea5c3e9bd33fefa55b |
| M | contracts/v2/contract_test.rb | dc92f4c3c498a41802f83e369ed090b0a69f9d4fde5331c4f9ce46c749c3fb4e |
| M | contracts/v2/openapi.json | 7b32f435e0a80228d2c0aee8a0f0c054dceb029bddd9427e5535e5200f766ee5 |
| M | documentation.md | b8f2f6851dafd0f49cbfad909f7bc000272d1adf11323ccba24a967868e91c3b |
| M | state.md | 083c4ce772b8007275d1d24931df2969cccc11a8468ea9312f3c8a3fa8ea038c |
