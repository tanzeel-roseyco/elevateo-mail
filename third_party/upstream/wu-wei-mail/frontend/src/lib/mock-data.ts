// ============================================================
// Mock data for Wu Wei Mail — Cold Email Platform
// ============================================================

// ---------- Dashboard ----------
export const dashboardStats = {
  activeCampaigns: 12,
  emailsSentToday: 847,
  replyRate: 5.2,
  bounceRate: 1.8,
};

export function generateSendsOverTime() {
  const data = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    data.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sends: Math.floor(Math.random() * 400 + 600),
      opens: Math.floor(Math.random() * 250 + 300),
      replies: Math.floor(Math.random() * 30 + 10),
    });
  }
  return data;
}

export const recentActivity = [
  { id: "1", campaign: "EU Yacht Brokers Q1", event: "Reply received", lead: "Hans Mueller", time: "2 min ago" },
  { id: "2", campaign: "SaaS Founders Outreach", event: "Email bounced", lead: "invalid@oldco.com", time: "15 min ago" },
  { id: "3", campaign: "EU Yacht Brokers Q1", event: "Email opened", lead: "Pierre Dupont", time: "23 min ago" },
  { id: "4", campaign: "Nordic CTO Campaign", event: "Reply received", lead: "Lars Svensson", time: "1 hr ago" },
  { id: "5", campaign: "UK Finance Directors", event: "Campaign launched", lead: "—", time: "2 hr ago" },
  { id: "6", campaign: "DACH HR Managers", event: "Email sent", lead: "Anna Braun", time: "3 hr ago" },
];

// ---------- Campaigns ----------
export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  leads: number;
  sent: number;
  opens: number;
  replies: number;
  created: string;
}

export const campaigns: Campaign[] = [
  { id: "1", name: "EU Yacht Brokers Q1", status: "active", leads: 1240, sent: 3820, opens: 1680, replies: 198, created: "2026-01-15" },
  { id: "2", name: "SaaS Founders Outreach", status: "active", leads: 890, sent: 2150, opens: 940, replies: 112, created: "2026-01-20" },
  { id: "3", name: "Nordic CTO Campaign", status: "active", leads: 560, sent: 1680, opens: 720, replies: 84, created: "2026-01-22" },
  { id: "4", name: "UK Finance Directors", status: "active", leads: 340, sent: 680, opens: 290, replies: 31, created: "2026-01-28" },
  { id: "5", name: "DACH HR Managers", status: "draft", leads: 2100, sent: 0, opens: 0, replies: 0, created: "2026-02-01" },
  { id: "6", name: "US Tech Recruiters", status: "paused", leads: 780, sent: 1560, opens: 620, replies: 45, created: "2025-12-10" },
  { id: "7", name: "French Marketing Agencies", status: "completed", leads: 450, sent: 1350, opens: 580, replies: 67, created: "2025-11-05" },
  { id: "8", name: "Benelux Logistics", status: "completed", leads: 320, sent: 960, opens: 410, replies: 38, created: "2025-10-15" },
  { id: "9", name: "Scandinavian Startups", status: "draft", leads: 670, sent: 0, opens: 0, replies: 0, created: "2026-02-03" },
  { id: "10", name: "MENA Real Estate", status: "active", leads: 420, sent: 840, opens: 360, replies: 42, created: "2026-01-25" },
];

// ---------- Leads ----------
export type LeadStatus = "active" | "bounced" | "replied" | "unsubscribed" | "new";

export interface Lead {
  id: string;
  name: string;
  email: string;
  company: string;
  title: string;
  tags: string[];
  status: LeadStatus;
  added: string;
}

export const leads: Lead[] = [
  { id: "1", name: "Hans Mueller", email: "hans@yachtbroker.de", company: "Mueller Yachts GmbH", title: "Managing Director", tags: ["yacht", "DACH"], status: "replied", added: "2026-01-15" },
  { id: "2", name: "Pierre Dupont", email: "pierre@voilier.fr", company: "Voilier Marine", title: "CEO", tags: ["yacht", "France"], status: "active", added: "2026-01-15" },
  { id: "3", name: "Lars Svensson", email: "lars@techstartup.se", company: "Nordic Tech AB", title: "CTO", tags: ["tech", "Nordic"], status: "replied", added: "2026-01-22" },
  { id: "4", name: "Anna Braun", email: "anna@hrclub.de", company: "HR Solutions GmbH", title: "HR Director", tags: ["HR", "DACH"], status: "active", added: "2026-02-01" },
  { id: "5", name: "James Smith", email: "james@finco.uk", company: "FinCo Ltd", title: "Finance Director", tags: ["finance", "UK"], status: "new", added: "2026-01-28" },
  { id: "6", name: "Maria Garcia", email: "maria@marketpro.es", company: "MarketPro", title: "Marketing Manager", tags: ["marketing", "Spain"], status: "active", added: "2026-01-20" },
  { id: "7", name: "old@defunct.com", email: "old@defunct.com", company: "Defunct Corp", title: "Unknown", tags: [], status: "bounced", added: "2025-12-10" },
  { id: "8", name: "Erik Nielsen", email: "erik@shipping.dk", company: "DK Shipping A/S", title: "Operations Manager", tags: ["logistics", "Nordic"], status: "active", added: "2026-01-25" },
  { id: "9", name: "Sophie Martin", email: "sophie@agency.fr", company: "Agence Digitale", title: "Founder", tags: ["agency", "France"], status: "unsubscribed", added: "2025-11-05" },
  { id: "10", name: "Ahmed Hassan", email: "ahmed@realestate.ae", company: "Gulf Properties", title: "Director", tags: ["real-estate", "MENA"], status: "new", added: "2026-01-25" },
  { id: "11", name: "Katrin Weber", email: "katrin@softdev.at", company: "SoftDev Austria", title: "VP Engineering", tags: ["tech", "DACH"], status: "active", added: "2026-01-18" },
  { id: "12", name: "Tom Johnson", email: "tom@recruit.us", company: "TalentFind Inc", title: "Senior Recruiter", tags: ["recruitment", "US"], status: "active", added: "2025-12-10" },
];

// ---------- Templates ----------
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  category: string;
  body: string;
  created: string;
}

export const templates: EmailTemplate[] = [
  { id: "1", name: "Cold Intro — Short", subject: "Quick question, {{first_name}}", category: "Cold Outreach", body: "Hey {{first_name}},\n\nI noticed {{company}} is growing fast in {{industry}}. We help companies like yours automate their outreach.\n\nWorth a quick chat?\n\nBest,\n{{sender_name}}", created: "2026-01-10" },
  { id: "2", name: "Follow Up — Value Add", subject: "Thought you'd find this useful", category: "Follow Up", body: "Hi {{first_name}},\n\nI wanted to share a case study from a company similar to {{company}} that saw a 3x increase in reply rates.\n\nWould love to show you how.\n\nCheers,\n{{sender_name}}", created: "2026-01-10" },
  { id: "3", name: "Breakup Email", subject: "Should I close your file?", category: "Follow Up", body: "Hey {{first_name}},\n\nI've reached out a few times and haven't heard back. Totally understand if now isn't the right time.\n\nIf things change, I'm here.\n\nBest,\n{{sender_name}}", created: "2026-01-12" },
  { id: "4", name: "Referral Ask", subject: "Who handles {{topic}} at {{company}}?", category: "Cold Outreach", body: "Hi {{first_name}},\n\nI'm trying to connect with the person at {{company}} who handles {{topic}}. Would you be able to point me in the right direction?\n\nThanks!\n{{sender_name}}", created: "2026-01-15" },
  { id: "5", name: "Event Follow Up", subject: "Great meeting you at {{event}}", category: "Event", body: "Hey {{first_name}},\n\nIt was great connecting at {{event}}. I'd love to continue our conversation about {{topic}}.\n\nFree for a quick call this week?\n\n{{sender_name}}", created: "2026-01-20" },
  { id: "6", name: "Social Proof", subject: "How {{reference_company}} boosted replies by 40%", category: "Cold Outreach", body: "Hi {{first_name}},\n\n{{reference_company}} was struggling with low reply rates until they started using our approach. Within 30 days, they saw a 40% increase.\n\nI think {{company}} could see similar results.\n\nInterested?\n{{sender_name}}", created: "2026-01-25" },
];

// ---------- Inbox ----------
export interface InboxMessage {
  id: string;
  from: string;
  fromEmail: string;
  subject: string;
  preview: string;
  body: string;
  campaign: string;
  time: string;
  read: boolean;
  thread: { from: string; body: string; time: string }[];
}

export const inboxMessages: InboxMessage[] = [
  {
    id: "1",
    from: "Hans Mueller",
    fromEmail: "hans@yachtbroker.de",
    subject: "Re: Quick question, Hans",
    preview: "Thanks for reaching out. We're actually looking for something like this...",
    body: "Thanks for reaching out. We're actually looking for something like this. Could you send over some more details about pricing and how integration works with our current CRM?\n\nBest regards,\nHans",
    campaign: "EU Yacht Brokers Q1",
    time: "10:32 AM",
    read: false,
    thread: [
      { from: "You", body: "Hey Hans,\n\nI noticed Mueller Yachts GmbH is expanding into the Mediterranean market. We help yacht brokers automate their outreach to potential clients.\n\nWorth a quick chat?\n\nBest,\nLars", time: "Yesterday 2:15 PM" },
      { from: "Hans Mueller", body: "Thanks for reaching out. We're actually looking for something like this. Could you send over some more details about pricing and how integration works with our current CRM?\n\nBest regards,\nHans", time: "10:32 AM" },
    ],
  },
  {
    id: "2",
    from: "Lars Svensson",
    fromEmail: "lars@techstartup.se",
    subject: "Re: Scaling your dev team?",
    preview: "Interesting timing — we just started looking at this...",
    body: "Interesting timing — we just started looking at this. Can we schedule a call next Tuesday?\n\nLars",
    campaign: "Nordic CTO Campaign",
    time: "9:15 AM",
    read: false,
    thread: [
      { from: "You", body: "Hi Lars,\n\nNordic Tech AB caught my attention — impressive growth! Are you finding it challenging to scale the engineering team?\n\nI'd love to share how other Nordic CTOs are handling this.\n\nBest,\nLars", time: "2 days ago" },
      { from: "Lars Svensson", body: "Interesting timing — we just started looking at this. Can we schedule a call next Tuesday?\n\nLars", time: "9:15 AM" },
    ],
  },
  {
    id: "3",
    from: "Maria Garcia",
    fromEmail: "maria@marketpro.es",
    subject: "Re: Marketing automation for MarketPro",
    preview: "Hi, I appreciate you reaching out but we're not interested at this time...",
    body: "Hi, I appreciate you reaching out but we're not interested at this time. Please remove me from your list.\n\nRegards,\nMaria",
    campaign: "SaaS Founders Outreach",
    time: "Yesterday",
    read: true,
    thread: [
      { from: "You", body: "Hey Maria,\n\nI see MarketPro is doing great work in the Spanish market...", time: "3 days ago" },
      { from: "Maria Garcia", body: "Hi, I appreciate you reaching out but we're not interested at this time. Please remove me from your list.\n\nRegards,\nMaria", time: "Yesterday" },
    ],
  },
  {
    id: "4",
    from: "James Smith",
    fromEmail: "james@finco.uk",
    subject: "Re: Quick question about FinCo's growth",
    preview: "Sure, happy to chat. How about Thursday at 3pm GMT?",
    body: "Sure, happy to chat. How about Thursday at 3pm GMT?\n\nJames Smith\nFinance Director, FinCo Ltd",
    campaign: "UK Finance Directors",
    time: "Yesterday",
    read: true,
    thread: [
      { from: "You", body: "Hi James,\n\nI noticed FinCo recently expanded...", time: "4 days ago" },
      { from: "James Smith", body: "Sure, happy to chat. How about Thursday at 3pm GMT?\n\nJames Smith\nFinance Director, FinCo Ltd", time: "Yesterday" },
    ],
  },
  {
    id: "5",
    from: "Ahmed Hassan",
    fromEmail: "ahmed@realestate.ae",
    subject: "Re: Gulf Properties outreach",
    preview: "This looks interesting. Can you tell me more about your experience with...",
    body: "This looks interesting. Can you tell me more about your experience with real estate companies in the region?\n\nBest,\nAhmed",
    campaign: "MENA Real Estate",
    time: "2 days ago",
    read: true,
    thread: [
      { from: "You", body: "Hi Ahmed,\n\nGulf Properties seems to be making waves...", time: "5 days ago" },
      { from: "Ahmed Hassan", body: "This looks interesting. Can you tell me more about your experience with real estate companies in the region?\n\nBest,\nAhmed", time: "2 days ago" },
    ],
  },
  {
    id: "6",
    from: "Katrin Weber",
    fromEmail: "katrin@softdev.at",
    subject: "Re: Engineering team scaling at SoftDev",
    preview: "We've been struggling with exactly this problem. Let's talk...",
    body: "We've been struggling with exactly this problem. Let's talk — do you have availability next week for a 20-minute call?\n\nKatrin Weber\nVP Engineering, SoftDev Austria",
    campaign: "Nordic CTO Campaign",
    time: "2 days ago",
    read: false,
    thread: [
      { from: "You", body: "Hi Katrin,\n\nI came across SoftDev Austria and noticed your engineering team has doubled in the past year. Scaling that fast comes with challenges...", time: "4 days ago" },
      { from: "Katrin Weber", body: "We've been struggling with exactly this problem. Let's talk — do you have availability next week for a 20-minute call?\n\nKatrin Weber\nVP Engineering, SoftDev Austria", time: "2 days ago" },
    ],
  },
  {
    id: "7",
    from: "Erik Nielsen",
    fromEmail: "erik@shipping.dk",
    subject: "Re: Logistics automation for DK Shipping",
    preview: "Forwarded your email to our head of digital transformation...",
    body: "Hi,\n\nI've forwarded your email to our head of digital transformation, Morten Andersen. He'll be the right person to discuss this with.\n\nBest,\nErik Nielsen\nOperations Manager",
    campaign: "SaaS Founders Outreach",
    time: "3 days ago",
    read: true,
    thread: [
      { from: "You", body: "Hi Erik,\n\nDK Shipping's growth in the Nordic market is impressive...", time: "5 days ago" },
      { from: "Erik Nielsen", body: "Hi,\n\nI've forwarded your email to our head of digital transformation, Morten Andersen. He'll be the right person to discuss this with.\n\nBest,\nErik Nielsen\nOperations Manager", time: "3 days ago" },
    ],
  },
  {
    id: "8",
    from: "Tom Johnson",
    fromEmail: "tom@recruit.us",
    subject: "Re: Recruitment automation",
    preview: "Not interested right now, but circle back in Q3...",
    body: "Thanks for reaching out. We're locked into our current tooling through Q2, but feel free to circle back in Q3 when our contract is up for renewal.\n\nTom",
    campaign: "SaaS Founders Outreach",
    time: "3 days ago",
    read: true,
    thread: [
      { from: "You", body: "Hey Tom,\n\nTalentFind's growth has been incredible...", time: "6 days ago" },
      { from: "Tom Johnson", body: "Thanks for reaching out. We're locked into our current tooling through Q2, but feel free to circle back in Q3 when our contract is up for renewal.\n\nTom", time: "3 days ago" },
    ],
  },
  {
    id: "9",
    from: "Pierre Dupont",
    fromEmail: "pierre@voilier.fr",
    subject: "Re: Yacht sales in the Mediterranean",
    preview: "Bonjour! Yes, we are expanding into the Med market. Very interested...",
    body: "Bonjour!\n\nYes, we are expanding into the Mediterranean market this season. Very interested in how you can help us reach new buyers.\n\nCould you share a case study from another yacht company?\n\nMerci,\nPierre Dupont\nCEO, Voilier Marine",
    campaign: "EU Yacht Brokers Q1",
    time: "4 days ago",
    read: false,
    thread: [
      { from: "You", body: "Bonjour Pierre,\n\nVoilier Marine has a stellar reputation in the French market...", time: "6 days ago" },
      { from: "Pierre Dupont", body: "Bonjour!\n\nYes, we are expanding into the Mediterranean market this season. Very interested in how you can help us reach new buyers.\n\nCould you share a case study from another yacht company?\n\nMerci,\nPierre Dupont\nCEO, Voilier Marine", time: "4 days ago" },
    ],
  },
  {
    id: "10",
    from: "Anna Braun",
    fromEmail: "anna@hrclub.de",
    subject: "Re: HR automation for growing teams",
    preview: "We actually just signed with a competitor. Maybe next year...",
    body: "Hi,\n\nAppreciate you reaching out. We actually just signed a 12-month contract with a competitor last month. Maybe we can revisit this next year.\n\nBest,\nAnna Braun\nHR Director",
    campaign: "DACH HR Managers",
    time: "5 days ago",
    read: true,
    thread: [
      { from: "You", body: "Hi Anna,\n\nHR Solutions GmbH has been growing rapidly...", time: "7 days ago" },
      { from: "Anna Braun", body: "Hi,\n\nAppreciate you reaching out. We actually just signed a 12-month contract with a competitor last month. Maybe we can revisit this next year.\n\nBest,\nAnna Braun\nHR Director", time: "5 days ago" },
    ],
  },
];

// ---------- Accounts ----------
export type AccountProvider = "google" | "microsoft" | "manual";

export interface SendingAccount {
  id: string;
  email: string;
  name: string;
  status: "connected" | "warming" | "error" | "disconnected";
  healthScore: number;
  warmupProgress: number;
  sendsToday: number;
  dailyLimit: number;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  provider: AccountProvider;
}

export const sendingAccounts: SendingAccount[] = [
  { id: "1", email: "lars.hendriksen@hr-club.net", name: "Lars Hendriksen", status: "connected", healthScore: 98, warmupProgress: 100, sendsToday: 42, dailyLimit: 50, spf: true, dkim: true, dmarc: true, provider: "google" },
  { id: "2", email: "outreach@wuwei.io", name: "Wu Wei Outreach", status: "connected", healthScore: 95, warmupProgress: 100, sendsToday: 38, dailyLimit: 50, spf: true, dkim: true, dmarc: true, provider: "google" },
  { id: "3", email: "sales@wuwei.io", name: "Wu Wei Sales", status: "warming", healthScore: 72, warmupProgress: 65, sendsToday: 15, dailyLimit: 25, spf: true, dkim: true, dmarc: false, provider: "microsoft" },
  { id: "4", email: "contact@nordic-outreach.com", name: "Nordic Outreach", status: "error", healthScore: 34, warmupProgress: 40, sendsToday: 0, dailyLimit: 30, spf: false, dkim: true, dmarc: false, provider: "manual" },
  { id: "5", email: "hello@wuwei.io", name: "Wu Wei Hello", status: "warming", healthScore: 85, warmupProgress: 78, sendsToday: 20, dailyLimit: 35, spf: true, dkim: true, dmarc: true, provider: "microsoft" },
];

// ---------- Analytics ----------
export function generateAnalyticsData() {
  const data = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    data.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sends: Math.floor(Math.random() * 500 + 700),
      openRate: Math.round((Math.random() * 15 + 38) * 10) / 10,
      replyRate: Math.round((Math.random() * 4 + 3) * 10) / 10,
      bounceRate: Math.round((Math.random() * 1.5 + 0.5) * 10) / 10,
    });
  }
  return data;
}

export const campaignComparison = [
  { name: "EU Yacht Brokers Q1", sent: 3820, openRate: 44.0, replyRate: 5.2, bounceRate: 1.2 },
  { name: "SaaS Founders Outreach", sent: 2150, openRate: 43.7, replyRate: 5.2, bounceRate: 1.5 },
  { name: "Nordic CTO Campaign", sent: 1680, openRate: 42.9, replyRate: 5.0, bounceRate: 1.1 },
  { name: "UK Finance Directors", sent: 680, openRate: 42.6, replyRate: 4.6, bounceRate: 1.8 },
  { name: "MENA Real Estate", sent: 840, openRate: 42.9, replyRate: 5.0, bounceRate: 2.1 },
];

// ---------- Lead Lists ----------
export const leadLists = [
  { id: "1", name: "EU Yacht Brokers", count: 1240 },
  { id: "2", name: "SaaS Founders", count: 890 },
  { id: "3", name: "Nordic CTOs", count: 560 },
  { id: "4", name: "UK Finance Directors", count: 340 },
  { id: "5", name: "DACH HR Managers", count: 2100 },
  { id: "6", name: "US Tech Recruiters", count: 780 },
];

// ---------- Settings ----------
export const workspaceSettings = {
  name: "Wu Wei Mail",
  timezone: "Europe/Copenhagen",
  unsubscribeText: "If you no longer wish to receive emails from us, click here to unsubscribe: {{unsubscribe_link}}",
  gdprEnabled: true,
  teamMembers: [
    { id: "1", name: "Lars Hendriksen", email: "lars@wuwei.io", role: "Owner", avatar: "LH" },
    { id: "2", name: "Lui Hedlund", email: "lui@wuwei.io", role: "Admin", avatar: "LU" },
  ],
};
