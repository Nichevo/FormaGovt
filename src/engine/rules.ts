/**
 * Rules versions. Every game records the rules it started with, so a challenge
 * link or a saved game always plays the same way. Games and links from before
 * v1.2 have no version and play the v1.1 rules.
 */
export type RulesVersion = '1.1' | '1.2';

export const LATEST_RULES: RulesVersion = '1.2';
export const RULES_VERSIONS: RulesVersion[] = ['1.2', '1.1'];

export const RULES_LABELS: Record<RulesVersion, { label: string; detail: string }> = {
  '1.2': {
    label: 'v1.2 (latest)',
    detail:
      'Parties guard their own voters, small parties soften their bottom lines over time, select committee and members’ bill commitments, agree to disagree, and optional leadership challenges.',
  },
  '1.1': { label: 'v1.1 (classic)', detail: 'The rules as they were before v1.2.' },
};

export interface Rules {
  version: RulesVersion;
  /** Partners refuse deals that leave their own voters too unhappy. */
  caucusFloor: boolean;
  /** Small parties' bottom lines soften as talks go on. */
  softening: boolean;
  /** Select committee and members' bill commitments. */
  softCommitments: boolean;
  /** One policy per deal can be set aside from mid-talks. */
  agreeToDisagree: boolean;
  /**
   * Confidence and supply is judged case by case: each side's voters weigh the other's
   * policies at half, and a C&S partner votes against a policy it cannot accept rather
   * than walking out.
   */
  csHalfCost: boolean;
  /** A party can agree to abstain on confidence votes, lowering the majority needed. */
  abstention: boolean;
}

export function rulesFor(version: RulesVersion | undefined): Rules {
  const v12 = version === '1.2';
  return { version: version ?? '1.1', caucusFloor: v12, softening: v12, softCommitments: v12, agreeToDisagree: v12, csHalfCost: v12, abstention: v12 };
}

export function isRulesVersion(v: unknown): v is RulesVersion {
  return v === '1.1' || v === '1.2';
}
