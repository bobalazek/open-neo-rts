import { type GameplayDefinition, type SeatSnapshot, weaponTargets } from "@open-neo-rts/sim";
import { idleBuilder } from "../match/hud-model";
import type { GuidanceProfile, HintId } from "./profile";

export interface ContextHint {
  id: HintId;
  definition?: string;
}
/** Only copied, currently permitted observations enter detection. No hidden world lookup. */
export function createContextHints(
  force: number,
  definitions: ReadonlyMap<string, GameplayDefinition>,
) {
  let prior = new Map<string, { health: number; definition: string }>(),
    tick = -1,
    lastShown = -400;
  const idleSince = new Map<string, number>();
  let attack: ContextHint | undefined;
  let current: ContextHint | undefined;
  function reset() {
    prior.clear();
    idleSince.clear();
    attack = undefined;
    current = undefined;
    tick = -1;
  }
  return {
    update(
      snapshot: SeatSnapshot,
      profile: GuidanceProfile,
      enabled = true,
    ): ContextHint | undefined {
      if (snapshot.mode !== "controlled" || snapshot.victory?.result) {
        reset();
        return;
      }
      if (snapshot.tick < tick) {
        reset();
        lastShown = snapshot.tick - 400;
      }
      if (snapshot.tick > tick) {
        tick = snapshot.tick;
        const own = snapshot.entities.filter((e) => e.force === force && e.health > 0);
        for (const entity of own) {
          const health = prior.get(entity.handle)?.health;
          if (health !== undefined && entity.health < health)
            attack = { id: "under-attack", definition: entity.definition };
          if (idleBuilder(entity, definitions.get(entity.definition))) {
            if (!idleSince.has(entity.handle)) idleSince.set(entity.handle, tick);
          } else idleSince.delete(entity.handle);
        }
        const handles = new Set(own.map((e) => e.handle));
        for (const handle of idleSince.keys()) if (!handles.has(handle)) idleSince.delete(handle);
        for (const event of snapshot.combatEvents ?? []) {
          const previous = event.entity && prior.get(event.entity);
          if (
            previous &&
            (event.type === "death" || (event.type === "damage" && (event.amount ?? 0) > 0))
          )
            attack = { id: "under-attack", definition: previous.definition };
        }
        prior = new Map(own.map((e) => [e.handle, { health: e.health, definition: e.definition }]));
      }
      if (profile.level === "off") {
        current = undefined;
        attack = undefined;
        return;
      }
      if (profile.level !== "all" && current?.id === "idle-builder") current = undefined;
      if (!enabled) return current;
      if (current && tick - lastShown >= 400) current = undefined;
      if (current || tick - lastShown < 400) return current;
      const candidates: ContextHint[] = [];
      if (snapshot.power?.some((p) => p.force === force && p.brownout))
        candidates.push({ id: "low-power" });
      if (attack) candidates.push(attack);
      const own = snapshot.entities.filter(
        (e) => e.force === force && e.health > 0 && !e.constructionSite,
      );
      const counter = snapshot.entities.find((enemy) => {
        if (enemy.force < 0 || enemy.force === force || enemy.health <= 0 || enemy.constructionSite)
          return false;
        return definitions.get(enemy.definition)?.weapons.some((weapon) =>
          own.some((entity) => {
            const target = definitions.get(entity.definition);
            return (
              target &&
              weaponTargets(weapon, target) &&
              weapon.warheads.some(
                (w) =>
                  w.type === "damage" &&
                  (w.amount ?? 0) > 0 &&
                  ((target.armor && w.versusPerMille?.[target.armor]) ??
                    w.versusPerMille?.default ??
                    1000) > 1000,
              )
            );
          }),
        );
      });
      if (counter) candidates.push({ id: "counter", definition: counter.definition });
      if (profile.level === "all") {
        const idle = own.find((e) => tick - (idleSince.get(e.handle) ?? tick) >= 200);
        if (idle) candidates.push({ id: "idle-builder", definition: idle.definition });
      }
      current = candidates.find((hint) => !profile.seen.includes(hint.id));
      if (current) {
        lastShown = tick;
        attack = undefined;
      }
      return current;
    },
    dismiss() {
      current = undefined;
    },
  };
}
