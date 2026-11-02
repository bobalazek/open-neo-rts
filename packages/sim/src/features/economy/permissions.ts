import { type Grant, hasGrant } from "../../commands";

/** Stock banks and power capacity share the economic inspection policy. */
export function canInspectEconomy(
  grants: readonly Grant[],
  seat: number,
  force: number,
  tick: number,
): boolean {
  return (
    ["economy.build", "economy.transfer", "production.queue", "research.spend"] as const
  ).some((scope) => hasGrant(grants, seat, force, scope, tick));
}
