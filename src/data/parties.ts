import { PartySchema, type Party } from './schema';
import act from './parties/act.json';
import greens from './parties/greens.json';
import labour from './parties/labour.json';
import national from './parties/national.json';
import nzfirst from './parties/nzfirst.json';
import opportunity from './parties/opportunity.json';
import tpm from './parties/tpm.json';

/** All playable parties, validated so bad data fails loudly at start-up. */
export const PARTIES: Party[] = [national, labour, greens, act, nzfirst, tpm, opportunity].map((raw) =>
  PartySchema.parse(raw),
);

export const PARTY_BY_ID: Record<string, Party> = Object.fromEntries(PARTIES.map((p) => [p.id, p]));
