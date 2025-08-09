import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Calculator, Target, Crosshair, Zap, Thermometer, AlertTriangle, History, PlusCircle } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface AttackerState {
  gunnery: number;
  moved_mode: 'stationary' | 'walked' | 'ran' | 'jumped' | 'prone';
  heat_points: number;
  damage_flags: {
    sensor_hit: boolean;
    shoulder_hit_arm_firing: boolean;
    upper_arm_actuator_hit_arm_firing: number;
    lower_arm_actuator_hit_arm_firing: number;
  };
  is_spotting_this_turn: boolean;
  is_making_indirect_fire: boolean;
  spotter_moved_mode: 'stationary' | 'walked' | 'ran' | 'jumped' | null;
  spotter_has_LOS_to_target: boolean;
  spotter_attacked_this_turn: boolean;
  attacker_is_prone: boolean;
}

interface TargetState {
  target_moved_hexes_from_last_reverse: number;
  target_jumped_this_turn: boolean;
  target_is_prone: 'adjacent' | 'non_adjacent' | 'no';
  target_is_immobile: boolean;
  target_is_in_light_woods: boolean;
  target_is_in_heavy_woods: boolean;
  intervening_light_woods_hexes: number;
  intervening_heavy_woods_hexes: number;
  has_partial_cover: boolean;
  partial_cover_from_water_depth1: boolean;
  target_is_submerged: boolean;
}

interface AttackContext {
  weapon_name: string;
  range_hexes: number;
  weapon_brackets: { short_max: number; medium_max: number; long_max: number };
  weapon_min_range: number;
  is_secondary_target_in_forward_arc: boolean;
  is_secondary_target_in_side_or_rear_arc: boolean;
  is_aimed_shot: boolean;
  is_head_aim: boolean;
  LOS_blocked: boolean;
}

interface GatorResult {
  weapon: string;
  range_hexes: number;
  gator: {
    G: { gunnery: number };
    A: { mode: string; value: number };
    T: { moved_hexes: number; jumped: boolean; value: number };
    O: {
      target_in_light_woods: number;
      target_in_heavy_woods: number;
      intervening_light_woods: number;
      intervening_heavy_woods: number;
      partial_cover: number;
      heat: number;
      damage: number;
      multi_target_forward: number;
      multi_target_side_rear: number;
      indirect_fire: number;
      spotter_movement: number;
      prone_mods: number;
      aimed_shot_adjustments: number;
      sum: number;
    };
    R: { bracket: string; bracket_mod: number; min_range_mod: number };
  };
  total_TN: number;
  auto_result: 'none' | 'auto_hit' | 'auto_miss';
  notes: string[];
}

interface ScoreRecord {
  id: string;
  timestamp: number;
  tn: number;
  auto: GatorResult['auto_result'];
  bracket: string;
  notes: string[];
}

const GatorCalculator: React.FC = () => {
  const [attacker, setAttacker] = useState<AttackerState>({
    gunnery: 4,
    moved_mode: 'stationary',
    heat_points: 0,
    damage_flags: {
      sensor_hit: false,
      shoulder_hit_arm_firing: false,
      upper_arm_actuator_hit_arm_firing: 0,
      lower_arm_actuator_hit_arm_firing: 0,
    },
    is_spotting_this_turn: false,
    is_making_indirect_fire: false,
    spotter_moved_mode: null,
    spotter_has_LOS_to_target: false,
    spotter_attacked_this_turn: false,
    attacker_is_prone: false,
  });

  const [target, setTarget] = useState<TargetState>({
    target_moved_hexes_from_last_reverse: 0,
    target_jumped_this_turn: false,
    target_is_prone: 'no',
    target_is_immobile: false,
    target_is_in_light_woods: false,
    target_is_in_heavy_woods: false,
    intervening_light_woods_hexes: 0,
    intervening_heavy_woods_hexes: 0,
    has_partial_cover: false,
    partial_cover_from_water_depth1: false,
    target_is_submerged: false,
  });

  const [attackContext, setAttackContext] = useState<AttackContext>({
    weapon_name: 'PPC',
    range_hexes: 10,
    weapon_brackets: { short_max: 6, medium_max: 12, long_max: 18 },
    weapon_min_range: 3,
    is_secondary_target_in_forward_arc: false,
    is_secondary_target_in_side_or_rear_arc: false,
    is_aimed_shot: false,
    is_head_aim: false,
    LOS_blocked: false,
  });

  const [dirty, setDirty] = useState({ G: false, A: false, T: false, O: false, R: false });
  const [view, setView] = useState<'calc' | 'history'>('calc');

  const [history, setHistory] = useState<ScoreRecord[]>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('gator-history') : null;
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('gator-history', JSON.stringify(history));
    } catch {}
  }, [history]);

  const sectionRefs = {
    G: useRef<HTMLDivElement>(null),
    A: useRef<HTMLDivElement>(null),
    T: useRef<HTMLDivElement>(null),
    O: useRef<HTMLDivElement>(null),
    R: useRef<HTMLDivElement>(null),
  } as const;

  const firstPanelRef = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const el = firstPanelRef.current;
      if (!el) { setShowBar(false); return; }
      const bottom = el.getBoundingClientRect().bottom + window.scrollY;
      const offset = 50;
      const scrolled = window.scrollY + offset;
      setShowBar(scrolled > bottom);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToSection = (key: keyof typeof sectionRefs) => {
    const el = sectionRefs[key].current;
    if (!el) return;
    const offset = 50; // ~50px offset to reveal header under top bar
    const y = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  };

  const handleNewScore = () => {
    const record: ScoreRecord = {
      id: String(Date.now()),
      timestamp: Date.now(),
      tn: calculateGator.total_TN,
      auto: calculateGator.auto_result,
      bracket: calculateGator.gator.R.bracket,
      notes: calculateGator.notes,
    };
    setHistory((prev) => [record, ...prev]);

    // Reset all states
    setAttacker({
      gunnery: 4,
      moved_mode: 'stationary',
      heat_points: 0,
      damage_flags: {
        sensor_hit: false,
        shoulder_hit_arm_firing: false,
        upper_arm_actuator_hit_arm_firing: 0,
        lower_arm_actuator_hit_arm_firing: 0,
      },
      is_spotting_this_turn: false,
      is_making_indirect_fire: false,
      spotter_moved_mode: null,
      spotter_has_LOS_to_target: false,
      spotter_attacked_this_turn: false,
      attacker_is_prone: false,
    });

    setTarget({
      target_moved_hexes_from_last_reverse: 0,
      target_jumped_this_turn: false,
      target_is_prone: 'no',
      target_is_immobile: false,
      target_is_in_light_woods: false,
      target_is_in_heavy_woods: false,
      intervening_light_woods_hexes: 0,
      intervening_heavy_woods_hexes: 0,
      has_partial_cover: false,
      partial_cover_from_water_depth1: false,
      target_is_submerged: false,
    });

    setAttackContext({
      weapon_name: 'PPC',
      range_hexes: 10,
      weapon_brackets: { short_max: 6, medium_max: 12, long_max: 18 },
      weapon_min_range: 3,
      is_secondary_target_in_forward_arc: false,
      is_secondary_target_in_side_or_rear_arc: false,
      is_aimed_shot: false,
      is_head_aim: false,
      LOS_blocked: false,
    });

    setDirty({ G: false, A: false, T: false, O: false, R: false });
    setView('calc');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const calculateGator = useMemo((): GatorResult => {
    const notes: string[] = [];
    
    // G - Gunnery
    const G = attacker.gunnery;

    // A - Attacker Movement
    const movementMods = {
      stationary: 0,
      walked: 1,
      ran: 2,
      jumped: 3,
      prone: 0
    };
    let A = movementMods[attacker.moved_mode];
    if (attacker.attacker_is_prone) {
      A += 2;
      notes.push("Attacker firing while prone: +2");
    }

    // T - Target Movement
    let T = 0;
    if (target.target_is_immobile) {
      T = -4;
      notes.push("Target immobile: -4");
    } else {
      // Zero out movement if target is prone (either state)
      const effectiveHexes = target.target_is_prone === 'no' 
        ? target.target_moved_hexes_from_last_reverse 
        : 0;

      // TMM based on effective hexes moved
      const hexes = effectiveHexes;
      if (hexes <= 2) T = 0;
      else if (hexes <= 4) T = 1;
      else if (hexes <= 6) T = 2;
      else if (hexes <= 9) T = 3;
      else if (hexes <= 17) T = 4;
      else if (hexes <= 24) T = 5;
      else T = 6;

      if (target.target_jumped_this_turn) {
        T += 1;
        notes.push("Target jumped: +1");
      }

      // Target prone modifications (after zeroing base movement)
      if (target.target_is_prone === 'adjacent') {
        T -= 2;
        notes.push("Target prone (adjacent): -2");
      } else if (target.target_is_prone === 'non_adjacent') {
        T += 1;
        notes.push("Target prone (non-adjacent): +1");
      }
    }

    // O - Other Modifiers
    let O = 0;
    
    // Terrain
    if (target.target_is_in_light_woods) {
      O += 1;
      notes.push("Target in light woods: +1");
    }
    if (target.target_is_in_heavy_woods) {
      O += 2;
      notes.push("Target in heavy woods: +2");
    }
    
    const intervening_light = target.intervening_light_woods_hexes;
    const intervening_heavy = target.intervening_heavy_woods_hexes;
    
    if (intervening_light > 0) {
      O += intervening_light;
      notes.push(`Intervening light woods: +${intervening_light}`);
    }
    if (intervening_heavy > 0) {
      O += intervening_heavy * 2;
      notes.push(`Intervening heavy woods: +${intervening_heavy * 2}`);
    }

    // LOS check for woods
    const totalWoodsPoints = intervening_light + (intervening_heavy * 2);
    if (totalWoodsPoints > 2 && !attacker.is_making_indirect_fire) {
      notes.push("LOS blocked by woods (>2 points)");
    }

    if (target.has_partial_cover) {
      if (!attackContext.is_aimed_shot) {
        O += 1;
        notes.push("Partial cover: +1 (legs cannot be hit)");
      }
    }

    // Heat
    const heat = attacker.heat_points;
    let heatMod = 0;
    if (heat >= 24) heatMod = 4;
    else if (heat >= 17) heatMod = 3;
    else if (heat >= 13) heatMod = 2;
    else if (heat >= 8) heatMod = 1;
    
    if (heatMod > 0) {
      O += heatMod;
      notes.push(`Heat penalty: +${heatMod}`);
    }

    // Damage
    let damageMod = 0;
    if (attacker.damage_flags.sensor_hit) {
      damageMod += 2;
      notes.push("Sensor hit: +2");
    }
    if (attacker.damage_flags.shoulder_hit_arm_firing) {
      damageMod += 4;
      notes.push("Shoulder hit (firing arm): +4");
    }
    damageMod += attacker.damage_flags.upper_arm_actuator_hit_arm_firing;
    if (attacker.damage_flags.upper_arm_actuator_hit_arm_firing > 0) {
      notes.push(`Upper arm actuator hits: +${attacker.damage_flags.upper_arm_actuator_hit_arm_firing}`);
    }
    damageMod += attacker.damage_flags.lower_arm_actuator_hit_arm_firing;
    if (attacker.damage_flags.lower_arm_actuator_hit_arm_firing > 0) {
      notes.push(`Lower arm actuator hits: +${attacker.damage_flags.lower_arm_actuator_hit_arm_firing}`);
    }
    O += damageMod;

    // Multi-target
    if (attackContext.is_secondary_target_in_forward_arc) {
      O += 1;
      notes.push("Secondary target (forward arc): +1");
    }
    if (attackContext.is_secondary_target_in_side_or_rear_arc) {
      O += 2;
      notes.push("Secondary target (side/rear arc): +2");
    }

    // Indirect Fire
    let indirectMod = 0;
    let spotterMod = 0;
    if (attacker.is_making_indirect_fire) {
      indirectMod += 1;
      notes.push("Indirect fire: +1");
      
      if (attacker.spotter_moved_mode) {
        const spotterMoveMods = { stationary: 0, walked: 1, ran: 2, jumped: 3 };
        spotterMod = spotterMoveMods[attacker.spotter_moved_mode];
        if (spotterMod > 0) {
          notes.push(`Spotter movement: +${spotterMod}`);
        }
      }
      
      if (attacker.spotter_attacked_this_turn) {
        indirectMod += 1;
        notes.push("Spotter also attacked: +1");
      }
    }

    if (attacker.is_spotting_this_turn) {
      O += 1;
      notes.push("Spotting this turn: +1");
    }

    // Aimed shot adjustments
    let aimedAdjustment = 0;
    if (attackContext.is_aimed_shot) {
      if (attackContext.is_head_aim) {
        aimedAdjustment = 3; // +3 for head aim, removes the -4 immobile bonus
        T = 0; // Remove immobile bonus for head shots
        notes.push("Aimed shot (head): +3 (no immobile bonus)");
      } else {
        notes.push("Aimed shot (non-head): keeps immobile bonus");
      }
    }

    O += indirectMod + spotterMod + aimedAdjustment;

    // R - Range
    const range = attackContext.range_hexes;
    let rangeMod = 0;
    let bracket = '';
    
    if (range <= attackContext.weapon_brackets.short_max) {
      rangeMod = 0;
      bracket = 'short';
    } else if (range <= attackContext.weapon_brackets.medium_max) {
      rangeMod = 2;
      bracket = 'medium';
    } else if (range <= attackContext.weapon_brackets.long_max) {
      rangeMod = 4;
      bracket = 'long';
    } else {
      bracket = 'beyond';
      notes.push("Range beyond maximum - attack invalid");
    }

    // Minimum range
    let minRangeMod = 0;
    if (range < attackContext.weapon_min_range) {
      minRangeMod = attackContext.weapon_min_range - range + 1;
      notes.push(`Minimum range penalty: +${minRangeMod}`);
    }

    const R = rangeMod + minRangeMod;

    // Total
    const totalTN = G + A + T + O + R;
    
    let autoResult: 'none' | 'auto_hit' | 'auto_miss' = 'none';
    if (totalTN <= 2) {
      autoResult = 'auto_hit';
      notes.push("Automatic hit (TN ≤ 2)");
    } else if (totalTN > 12) {
      autoResult = 'auto_miss';
      notes.push("Automatic miss (TN > 12)");
    }

    return {
      weapon: attackContext.weapon_name,
      range_hexes: range,
      gator: {
        G: { gunnery: G },
        A: { mode: attacker.moved_mode, value: A },
        T: { moved_hexes: target.target_moved_hexes_from_last_reverse, jumped: target.target_jumped_this_turn, value: T },
        O: {
          target_in_light_woods: target.target_is_in_light_woods ? 1 : 0,
          target_in_heavy_woods: target.target_is_in_heavy_woods ? 2 : 0,
          intervening_light_woods: intervening_light,
          intervening_heavy_woods: intervening_heavy * 2,
          partial_cover: (target.has_partial_cover && !attackContext.is_aimed_shot) ? 1 : 0,
          heat: heatMod,
          damage: damageMod,
          multi_target_forward: attackContext.is_secondary_target_in_forward_arc ? 1 : 0,
          multi_target_side_rear: attackContext.is_secondary_target_in_side_or_rear_arc ? 2 : 0,
          indirect_fire: indirectMod,
          spotter_movement: spotterMod,
          prone_mods: 0, // Already included in T calculation
          aimed_shot_adjustments: aimedAdjustment,
          sum: O
        },
        R: { bracket, bracket_mod: rangeMod, min_range_mod: minRangeMod }
      },
      total_TN: totalTN,
      auto_result: autoResult,
      notes
    };
  }, [attacker, target, attackContext]);

  const getResultColor = (tn: number, autoResult: string) => {
    if (autoResult === 'auto_hit') return 'status-good';
    if (autoResult === 'auto_miss') return 'status-danger';
    if (tn <= 4) return 'status-good';
    if (tn <= 8) return 'status-warning';
    return 'status-danger';
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-28 pl-20">
      {/* Floating condensed TN chip */}
      {showBar && (
        <div className="fixed top-3 left-0 right-0 z-50 pointer-events-none">
          <div className="mx-auto w-fit">
            <Card className={`hud-panel px-4 py-2 rounded-full backdrop-blur-md bg-background/70 border ${getResultColor(calculateGator.total_TN, calculateGator.auto_result)}`}>
              <div className="flex items-center gap-3">
                <Crosshair className="w-4 h-4 text-primary" />
                <span className="text-xs tracking-widest opacity-80">TN</span>
                <span className="hud-number text-2xl">{calculateGator.total_TN}</span>
                <span className="text-xs text-muted-foreground">
                  {calculateGator.auto_result === 'auto_hit' ? 'AUTO HIT' : calculateGator.auto_result === 'auto_miss' ? 'AUTO MISS' : `${calculateGator.gator.R.bracket.toUpperCase()} • 2D6 ≥ ${calculateGator.total_TN}`}
                </span>
              </div>
            </Card>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <Calculator className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold gator-header">G.A.T.O.R. CALCULATOR</h1>
            <Target className="w-8 h-8 text-primary" />
          </div>
          <p className="text-muted-foreground text-lg">
            BattleTech Firing Solution Computer
          </p>
        </div>

        {/* Result Display */}
        <div ref={firstPanelRef}><Card className={`hud-panel p-6 text-center ${getResultColor(calculateGator.total_TN, calculateGator.auto_result)}`}>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">MODIFIER SCORE</h2>
            <div className="hud-number text-6xl">
              {calculateGator.total_TN}
            </div>
            <div className="text-sm opacity-80">
              {calculateGator.auto_result === 'auto_hit' && 'AUTOMATIC HIT'}
              {calculateGator.auto_result === 'auto_miss' && 'AUTOMATIC MISS'}
              {calculateGator.auto_result === 'none' && `Roll 2D6 ≥ ${calculateGator.total_TN}`}
            </div>
          </div>
        </Card></div>

{view === 'history' && (
          <Card className="hud-panel p-4">
            <div className="space-y-2">
              <h3 className="gator-header">HISTORY</h3>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No scores yet. Tap New Score to save your current TN.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between rounded border p-2">
                      <div className="flex items-center gap-3">
                        <span className="hud-number text-2xl">{h.tn}</span>
                        <div className="text-xs text-muted-foreground">
                          <div>{new Date(h.timestamp).toLocaleString()}</div>
                          <div className="uppercase">{h.bracket}</div>
                        </div>
                      </div>
                      <div className={`text-xs px-2 py-1 rounded ${h.auto==='auto_hit' ? 'status-good' : h.auto==='auto_miss' ? 'status-danger' : 'bg-muted'}`}>
                        {h.auto==='auto_hit' ? 'AUTO HIT' : h.auto==='auto_miss' ? 'AUTO MISS' : 'NORMAL'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}

        {view !== 'history' && (
          <>
          {/* G.A.T.O.R. Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* G - Gunnery */}
          <div ref={sectionRefs.G}><Card className="hud-panel p-4">
            <div className="space-y-4">
              <h3 className="gator-header text-center">G - GUNNERY</h3>
              <div className="text-center">
                <div className="hud-number text-3xl">{calculateGator.gator.G.gunnery}</div>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Pilot Skill</label>
                <Slider
                  value={[attacker.gunnery]}
                  onValueChange={(value) => { setAttacker(prev => ({ ...prev, gunnery: value[0] })); setDirty(d => ({ ...d, G: true })); }}
                  onValueCommit={(value) => { setAttacker(prev => ({ ...prev, gunnery: value[0] })); setDirty(d => ({ ...d, G: true })); }}
                  min={0}
                  max={8}
                  step={1}
                  aria-label="Gunnery"
                  className="hud-slider"
                />
                <div className="text-center text-sm">{attacker.gunnery}</div>
              </div>
            </div>
          </Card></div>

          {/* A - Attacker */}
          <div ref={sectionRefs.A}><Card className="hud-panel p-4">
            <div className="space-y-4">
              <h3 className="gator-header text-center">A - ATTACKER</h3>
              <div className="text-center">
                <div className="hud-number text-3xl">+{calculateGator.gator.A.value}</div>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Movement</label>
                <div className="grid grid-cols-2 gap-1">
                  {(['stationary', 'walked', 'ran', 'jumped'] as const).map((mode) => (
                    <Button
                      key={mode}
                      variant="hud"
                      size="sm"
                      className={`hud-button text-xs ${attacker.moved_mode === mode ? 'active' : ''}`}
                      onClick={() => { setAttacker(prev => ({ ...prev, moved_mode: mode })); setDirty(d => ({ ...d, A: true })); }}
                    >
                      {mode.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Thermometer className="w-4 h-4" />
                  <label className="text-sm text-muted-foreground">Heat: {attacker.heat_points}</label>
                </div>
                <Slider
                  value={[attacker.heat_points]}
                  onValueChange={(value) => { setAttacker(prev => ({ ...prev, heat_points: value[0] })); setDirty(d => ({ ...d, A: true })); }}
                  onValueCommit={(value) => { setAttacker(prev => ({ ...prev, heat_points: value[0] })); setDirty(d => ({ ...d, A: true })); }}
                  min={0}
                  max={30}
                  step={1}
                  aria-label="Heat"
                  className="hud-slider"
                />
              </div>
            </div>
          </Card></div>

          {/* T - Target */}
          <div ref={sectionRefs.T}><Card className="hud-panel p-4">
            <div className="space-y-4">
              <h3 className="gator-header text-center">T - TARGET</h3>
              <div className="text-center">
                <div className="hud-number text-3xl">
                  {calculateGator.gator.T.value >= 0 ? '+' : ''}{calculateGator.gator.T.value}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Hexes Moved: {target.target_moved_hexes_from_last_reverse}</label>
                <Slider
                  value={[target.target_moved_hexes_from_last_reverse]}
                  onValueChange={(value) => { setTarget(prev => ({ ...prev, target_moved_hexes_from_last_reverse: value[0] })); setDirty(d => ({ ...d, T: true })); }}
                  onValueCommit={(value) => { setTarget(prev => ({ ...prev, target_moved_hexes_from_last_reverse: value[0] })); setDirty(d => ({ ...d, T: true })); }}
                  min={0}
                  max={30}
                  step={1}
                  aria-label="Target hexes moved"
                  className="hud-slider"
                />
              </div>
              <div className="grid grid-cols-2 gap-1">
                <Button
                  variant="hud"
                  size="sm"
                  className={`hud-button text-xs ${target.target_jumped_this_turn ? 'active' : ''}`}
                  onClick={() => { setTarget(prev => ({ ...prev, target_jumped_this_turn: !prev.target_jumped_this_turn })); setDirty(d => ({ ...d, T: true })); }}
                >
                  JUMPED
                </Button>
                <div className="col-span-2 flex justify-center">
                  <ToggleGroup
                    type="single"
                    value={target.target_is_immobile ? 'immobile' : (target.target_is_prone === 'no' ? '' : (target.target_is_prone === 'adjacent' ? 'prone_adjacent' : 'prone'))}
                    onValueChange={(v) => {
                      setDirty(d => ({ ...d, T: true }));
                      if (!v) {
                        setTarget(prev => ({ ...prev, target_is_prone: 'no', target_is_immobile: false }));
                        return;
                      }
                      if (v === 'immobile') {
                        setTarget(prev => ({ ...prev, target_is_prone: 'no', target_is_immobile: true }));
                      } else if (v === 'prone_adjacent') {
                        setTarget(prev => ({ ...prev, target_is_prone: 'adjacent', target_is_immobile: false }));
                      } else if (v === 'prone') {
                        setTarget(prev => ({ ...prev, target_is_prone: 'non_adjacent', target_is_immobile: false }));
                      }
                    }}
                    variant="outline"
                    size="sm"
                    aria-label="Target status"
                  >
                    <ToggleGroupItem value="prone_adjacent">Prone (Adjacent)</ToggleGroupItem>
                    <ToggleGroupItem value="prone">Prone</ToggleGroupItem>
                    <ToggleGroupItem value="immobile">Immobile</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
            </div>
          </Card></div>

          {/* O - Other */}
          <div ref={sectionRefs.O}><Card className="hud-panel p-4">
            <div className="space-y-4">
              <h3 className="gator-header text-center">O - OTHER</h3>
              <div className="text-center">
                <div className="hud-number text-3xl">+{calculateGator.gator.O.sum}</div>
              </div>
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-1">
                  <Button
                    variant="hud"
                    size="sm"
                    className={`hud-button text-xs ${target.target_is_in_light_woods ? 'active' : ''}`}
                    onClick={() => { setTarget(prev => { const next = !prev.target_is_in_light_woods; return { ...prev, target_is_in_light_woods: next, target_is_in_heavy_woods: next ? false : prev.target_is_in_heavy_woods }; }); setDirty(d => ({ ...d, O: true })); }}
                  >
                    LT WOODS
                  </Button>
                  <Button
                    variant="hud"
                    size="sm"
                    className={`hud-button text-xs ${target.target_is_in_heavy_woods ? 'active' : ''}`}
                    onClick={() => { setTarget(prev => { const next = !prev.target_is_in_heavy_woods; return { ...prev, target_is_in_heavy_woods: next, target_is_in_light_woods: next ? false : prev.target_is_in_light_woods }; }); setDirty(d => ({ ...d, O: true })); }}
                  >
                    HV WOODS
                  </Button>
                  <Button
                    variant="hud"
                    size="sm"
                    className={`hud-button text-xs ${target.has_partial_cover ? 'active' : ''}`}
                    onClick={() => { setTarget(prev => ({ ...prev, has_partial_cover: !prev.has_partial_cover })); setDirty(d => ({ ...d, O: true })); }}
                  >
                    COVER
                  </Button>
                  <Button
                    variant="hud"
                    size="sm"
                    className={`hud-button text-xs ${attacker.is_making_indirect_fire ? 'active' : ''}`}
                    onClick={() => { setAttacker(prev => ({ ...prev, is_making_indirect_fire: !prev.is_making_indirect_fire })); setDirty(d => ({ ...d, O: true })); }}
                  >
                    INDIRECT
                  </Button>
                </div>
              </div>
            </div>
          </Card></div>

          {/* R - Range */}
          <div ref={sectionRefs.R}><Card className="hud-panel p-4">
            <div className="space-y-4">
              <h3 className="gator-header text-center">R - RANGE</h3>
              <div className="text-center">
                <div className="hud-number text-3xl">+{calculateGator.gator.R.bracket_mod + calculateGator.gator.R.min_range_mod}</div>
              </div>
              <div className="space-y-3">
                <div className="text-center text-sm text-muted-foreground">Select Range</div>
                <div className="flex justify-center">
                  <ToggleGroup
                    type="single"
                    value={calculateGator.gator.R.bracket as "short" | "medium" | "long"}
                    onValueChange={(v) => {
                      if (!v) return;
                      setDirty(d => ({ ...d, R: true }));
                      setAttackContext(prev => {
                        const wb = prev.weapon_brackets;
                        const inside = Math.max(0, prev.weapon_min_range - prev.range_hexes);
                        let newRange = prev.range_hexes;
                        if (v === "short") {
                          newRange = Math.max(1, prev.weapon_min_range - inside);
                        } else if (v === "medium") {
                          newRange = wb.short_max + 1;
                        } else {
                          newRange = wb.medium_max + 1;
                        }
                        return { ...prev, range_hexes: newRange };
                      });
                    }}
                    variant="outline"
                    size="sm"
                    aria-label="Select range bracket"
                  >
                    <ToggleGroupItem value="short">Short</ToggleGroupItem>
                    <ToggleGroupItem value="medium">Medium</ToggleGroupItem>
                    <ToggleGroupItem value="long">Long</ToggleGroupItem>
                  </ToggleGroup>
                </div>

                <div className="text-center text-sm text-muted-foreground mt-2">Minimum</div>
                <div className="flex justify-center">
                  <ToggleGroup
                    type="single"
                    value={String(Math.max(0, attackContext.weapon_min_range - attackContext.range_hexes))}
                    onValueChange={(v) => {
                      if (!v) return;
                      if (calculateGator.gator.R.bracket !== 'short') return;
                      const k = Number(v);
                      setDirty(d => ({ ...d, R: true }));
                      setAttackContext(prev => ({ ...prev, range_hexes: Math.max(1, prev.weapon_min_range - k) }));
                    }}
                    variant="outline"
                    size="sm"
                    aria-label="Minimum range inside amount"
                    disabled={calculateGator.gator.R.bracket !== 'short'}
                  >
                    {Array.from({ length: Math.min(5, Math.max(0, attackContext.weapon_min_range - 1)) + 1 }).map((_, idx) => (
                      <ToggleGroupItem key={idx} value={`${idx}`}>
                        {idx === 0 ? 'Equal' : `-${idx}`}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>

                <div className="text-center text-xs">
                  <div className={`px-2 py-1 rounded ${calculateGator.gator.R.bracket === 'short' ? 'status-good' : calculateGator.gator.R.bracket === 'medium' ? 'status-warning' : 'status-danger'}`}>
                    {calculateGator.gator.R.bracket.toUpperCase()}
                  </div>
                </div>
              </div>
            </div>
          </Card></div>
        </div>

        {/* Notes */}
        {calculateGator.notes.length > 0 && (
          <Card className="hud-panel p-4">
            <div className="space-y-2">
              <h3 className="gator-header flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                COMBAT NOTES
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {calculateGator.notes.map((note, index) => (
                  <div key={index} className="text-sm text-muted-foreground bg-muted/20 rounded p-2">
                    {note}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}
        <div className="h-24 md:h-12" aria-hidden="true" />
          </>
        )}
        </div>
        {/* Floating Vertical Tab Bar */}
        <div className="fixed left-3 top-1/2 z-50 transform -translate-y-1/2">
          <Card className="hud-panel rounded-xl bg-background/70 backdrop-blur p-2 border">
            <div className="flex flex-col items-stretch gap-2">
              <Button
                variant="hud"
                size="sm"
                className={`hud-button text-xs ${view==='history' ? 'active' : ''}`}
                onClick={() => setView(view==='history' ? 'calc' : 'history')}
                aria-label="Toggle history"
              >
                <History className="w-4 h-4" />
                <span className="ml-1 hidden xl:inline">{view==='history' ? 'Back' : 'History'}</span>
              </Button>
              <div className="h-px w-full bg-border/60" aria-hidden="true" />
              <Button variant="hud" size="sm" className={`relative hud-button text-xs ${dirty.G ? 'active' : ''}`} onClick={() => { setView('calc'); scrollToSection('G'); }} aria-label="Go to G">
                G
                {dirty.G && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />}
              </Button>
              <Button variant="hud" size="sm" className={`relative hud-button text-xs ${dirty.A ? 'active' : ''}`} onClick={() => { setView('calc'); scrollToSection('A'); }} aria-label="Go to A">
                A
                {dirty.A && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />}
              </Button>
              <Button variant="hud" size="sm" className={`relative hud-button text-xs ${dirty.T ? 'active' : ''}`} onClick={() => { setView('calc'); scrollToSection('T'); }} aria-label="Go to T">
                T
                {dirty.T && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />}
              </Button>
              <Button variant="hud" size="sm" className={`relative hud-button text-xs ${dirty.O ? 'active' : ''}`} onClick={() => { setView('calc'); scrollToSection('O'); }} aria-label="Go to O">
                O
                {dirty.O && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />}
              </Button>
              <Button variant="hud" size="sm" className={`relative hud-button text-xs ${dirty.R ? 'active' : ''}`} onClick={() => { setView('calc'); scrollToSection('R'); }} aria-label="Go to R">
                R
                {dirty.R && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />}
              </Button>
              <div className="h-px w-full bg-border/60" aria-hidden="true" />
              <Button variant="hud" size="sm" className="hud-button text-xs" onClick={handleNewScore} aria-label="New score">
                <PlusCircle className="w-4 h-4" />
                <span className="ml-1 hidden xl:inline">New Score</span>
              </Button>
            </div>
          </Card>
        </div>
      </div>
  );
};

export default GatorCalculator;