import { z } from 'zod';

/** The ten policy groups. Every policy belongs to exactly one. */
export const ISSUES = [
  'tax',
  'kiwisaver-retirement',
  'health',
  'cost-of-living',
  'housing',
  'climate-environment',
  'immigration',
  'governance',
  'treaty-maori',
  'law-order',
] as const;
export const IssueSchema = z.enum(ISSUES);
export type Issue = z.infer<typeof IssueSchema>;

export const ISSUE_LABELS: Record<Issue, string> = {
  tax: 'Tax',
  'kiwisaver-retirement': 'KiwiSaver and retirement',
  health: 'Health',
  'cost-of-living': 'Cost of living',
  housing: 'Housing',
  'climate-environment': 'Climate and environment',
  immigration: 'Immigration',
  governance: 'Governance',
  'treaty-maori': 'Treaty and Māori',
  'law-order': 'Law and order',
};

/** Stance on an issue axis: -2 strongly left or progressive, +2 strongly right or conservative. */
const Stance = z.number().min(-2).max(2);

export const PolicySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(3),
  /** Plain-English summary shown on the policy card. */
  summary: z.string().min(10),
  issue: IssueSchema,
  stance: Stance,
  /** How much the party cares about this policy, 1 (minor) to 5 (flagship). */
  weight: z.number().int().min(1).max(5),
  isBottomLine: z.boolean(),
  /** For a bottom line: fixed never bends, firm bends late or for a big win, soft bends readily. */
  flex: z.enum(['fixed', 'firm', 'soft']).optional(),
  /** A scaled-back version a firm or soft bottom line can accept. Written for the game, not a party proposal. */
  compromise: z
    .object({
      title: z.string().min(3),
      summary: z.string().min(10),
      /** Share of the full policy's budget effect the compromise keeps, 0 to 1. */
      fiscalShare: z.number().min(0).max(1),
    })
    .optional(),
  /**
   * For a bottom line: other policies of the same party that can stand in for it, so the
   * party needs this one or any of those. Set by the game, not a party statement.
   */
  orPolicyIds: z.array(z.string()).optional(),
  /** "declared" when the party has said so publicly, "inferred" when set from its messaging. */
  bottomLineBasis: z.enum(['declared', 'inferred']).optional(),
  /** How much the party's voters notice this policy, 0 to 1. */
  voterSalience: z.number().min(0).max(1),
  /** Yearly change to the operating balance in NZ$ millions (negative costs money); null until costed. */
  fiscalImpactNZDm: z.number().nullable(),
  /** "revenue" for tax changes, "spending" for programmes and cuts. */
  fiscalType: z.enum(['revenue', 'spending']),
  /** First fiscal year with an effect; before it the policy costs nothing. Defaults to a half year in 2026/27. */
  fiscalStart: z.enum(['2026/27', '2027/28', '2028/29', '2029/30']).optional(),
  /** Yearly figures 2026/27 to 2029/30 where a source gives them; otherwise derived from the single figure. */
  fiscalByYear: z.array(z.number()).length(4).optional(),
  /** "party" when the figure comes from the party's own costing, "estimate" when it is a rough game estimate. */
  fiscalBasis: z.enum(['party', 'estimate']).optional(),
  /** How the figure was worked out, shown on the policy card. */
  fiscalNote: z.string().optional(),
  /** Where a party costing was reported. */
  fiscalSourceUrl: z.string().url().optional(),
  sourceUrl: z.string().url(),
  /** Set by the game on the scaled-back version of a bottom line; never in the data files. */
  isCompromise: z.boolean().optional(),
});
export type Policy = z.infer<typeof PolicySchema>;

export const SKILLS = [
  'leadership',
  'finance',
  'economics',
  'health',
  'foreign-affairs',
  'justice',
  'housing',
  'environment',
  'maori-development',
  'social-services',
  'regional-development',
  'regulation',
  'education',
] as const;
export const SkillSchema = z.enum(SKILLS);

export const PersonSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Real name for key figures, a role title for placeholders. */
  name: z.string().min(2),
  role: z.string().min(2),
  /** Only key figures (leaders, deputies, a finance spokesperson) use real names. */
  isKeyFigure: z.boolean(),
  skills: z.array(SkillSchema).min(1),
  experience: z.number().int().min(1).max(3),
  pastRoles: z.array(z.string()),
});
export type Person = z.infer<typeof PersonSchema>;

export const RatificationSchema = z.object({
  body: z.string().min(3),
  /** In-game days between agreeing in principle and signing. */
  days: z.number().int().min(0).max(3),
  /** Share of the deciding body that must approve, 0 to 1. */
  threshold: z.number().min(0).max(1),
  /** Base chance the deal is rejected if the party's flagship policies were dropped. */
  rejectionRisk: z.number().min(0).max(1),
});

export const RelationshipSchema = z.object({
  partyId: z.string(),
  /** Starting trust, 0 to 100. */
  trust: z.number().min(0).max(100),
  /** Pre-election "ruled out" stance as a bias, not a ban: 0 none, 1 strong. */
  ruledOutBias: z.number().min(0).max(1),
});

export const PartySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  shortName: z.string().max(4),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  /** How much the party cares about each policy group, 0 to 1. */
  issueSalience: z.record(IssueSchema, z.number().min(0).max(1)),
  /** The party's own position on each policy group, -2 to +2. */
  issueStance: z.record(IssueSchema, Stance),
  personality: z.object({
    /** Rounds of failed offers before walking away. */
    patience: z.number().int().min(1).max(10),
    /** How far above its threshold it pushes before accepting, 0 to 1. */
    greed: z.number().min(0).max(1),
    /** Talks with both blocs at once. */
    kingmaker: z.boolean(),
    /** Deficit increase (NZ$m a year) it tolerates before balking. */
    fiscalTolerance: z.number().min(0),
    /** How long it holds out for more while it has options, 0 to 1. */
    holdout: z.number().min(0).max(1),
    /** Hawks reject deals that dig the deficit too deep; spenders reject deep cuts to services. */
    fiscalStance: z.enum(['hawk', 'balanced', 'spender']),
    /** Spending cuts (NZ$m a year) it accepts before objecting. */
    servicesCutTolerance: z.number().min(0).optional(),
  }),
  ratification: RatificationSchema,
  relationships: z.array(RelationshipSchema),
  people: z.array(PersonSchema).min(1),
  policies: z.array(PolicySchema).min(8).max(12),
});
export type Party = z.infer<typeof PartySchema>;

export const ScenarioSchema = z.object({
  id: z.string(),
  label: z.string(),
  source: z.string(),
  sourceUrl: z.string().url().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Party vote share in percent (or raw vote counts; only the ratios matter). */
  partyVote: z.record(z.string(), z.number().min(0)),
  /** Expected electorate seats won by each party. */
  electorates: z.record(z.string(), z.number().int().min(0)),
  /** Electorate seats won by independents or parties outside the game. */
  otherElectorates: z.number().int().min(0).default(0),
});
export type Scenario = z.infer<typeof ScenarioSchema>;
