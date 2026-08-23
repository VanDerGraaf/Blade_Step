import { useCallback, useEffect, useRef, useState } from "react";
import { Engine, initialUi, UiSnapshot } from "./game/engine";
import {
  Action,
  ACTIONS,
  ACTION_META,
  GameResult,
  MatchStats,
  PERSONALITIES,
  Personality,
} from "./game/types";
import { initAudio, isMuted, isMusicOn, setMuted, setMusicOn, sfx } from "./game/audio";
import { net, NetMsg } from "./game/net";
import {
  ActionIcon,
  IconHeart,
  IconHome,
  IconMusic,
  IconMute,
  IconPause,
  IconRetry,
  IconSkull,
  IconSound,
} from "./components/Icons";

/** "any" = random opponent each battle. */
type MenuChoice = Personality | "any";

// ---------------------------------------------------------------- dice

function HandDie({
  action,
  badge,
  dimmed,
  onClick,
  disabled,
  enemy,
  delay = 0,
  roll = true,
  hotkey,
}: {
  action: Action;
  badge?: number | null;
  dimmed?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  enemy?: boolean;
  delay?: number;
  roll?: boolean;
  hotkey?: number;
}) {
  const m = ACTION_META[action];
  return (
    <button
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`die no-select relative flex flex-col items-center justify-center gap-0.5 w-10 h-12 sm:w-11 sm:h-[52px] ${
        roll ? "anim-dice-roll" : ""
      } ${onClick ? "die-clickable" : ""} ${dimmed ? "opacity-35 saturate-50" : ""} ${
        badge ? "die-chosen" : ""
      }`}
      style={{ background: m.dark, animationDelay: roll ? `${delay}ms` : undefined }}
      aria-label={m.name}
    >
      {hotkey !== undefined && (
        <span className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-[#070919] text-dim font-pixel flex items-center justify-center border border-[#39406e]"
          style={{ fontSize: 6 }}
        >
          {hotkey}
        </span>
      )}
      <ActionIcon action={action} className="w-5 h-5 sm:w-6 sm:h-6" />
      <span className="font-pixel leading-none" style={{ color: m.color, fontSize: 5 }}>
        {m.short}
      </span>
      {badge ? (
        <span
          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gold text-[#070919] font-pixel flex items-center justify-center border border-[#070919]"
          style={{ fontSize: 7 }}
        >
          {badge}
        </span>
      ) : null}
      {enemy && <span className="absolute inset-0 border-2 border-[#070919]/50 pointer-events-none" />}
      <span className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: m.color, opacity: 0.85 }} />
    </button>
  );
}

function FlipDie({
  action,
  revealed,
  active,
  done,
  big,
  backColor = "#232b4d",
}: {
  action: Action | null;
  revealed: boolean; // true = action face is up, false = hidden "?" face is up
  active?: boolean;
  done?: boolean;
  big?: boolean;
  backColor?: string;
}) {
  const m = action ? ACTION_META[action] : null;
  return (
    <div
      className={`die-flip ${big ? "w-14 h-[68px] sm:w-[76px] sm:h-[92px]" : "w-[52px] h-16 sm:w-16 sm:h-[78px]"} ${
        done ? "opacity-35 saturate-50" : ""
      } ${active ? "anim-active-step" : ""}`}
    >
      <div className={`die-flip-inner ${revealed ? "" : "flipped"}`}>
        <div className="die-face die flex flex-col items-center justify-center gap-1" style={{ background: m ? m.dark : "#1c2244" }}>
          {m && action && (
            <>
              <ActionIcon action={action} className={big ? "w-8 h-8 sm:w-10 sm:h-10" : "w-7 h-7 sm:w-8 sm:h-8"} />
              <span className="font-pixel leading-none" style={{ color: m.color, fontSize: big ? 7 : 6 }}>
                {m.short}
              </span>
            </>
          )}
        </div>
        <div className="die-face back die flex items-center justify-center" style={{ background: backColor }}>
          <span className="font-pixel text-blood opacity-80" style={{ fontSize: 14 }}>
            ?
          </span>
          <span className="absolute inset-1 border-2 border-dashed border-[#39406e] pointer-events-none" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- HUD bits

function Pips({ hp, right }: { hp: number; right?: boolean }) {
  return (
    <div className={`flex gap-1 ${right ? "flex-row-reverse" : ""}`}>
      {[0, 1, 2].map((i) => (
        <span key={`${i}-${i < hp}`} className={`inline-block ${i < hp ? "text-blood" : "text-[#39406e]"} ${i === hp && hp > 0 ? "anim-pip" : ""}`}>
          <IconHeart className="w-4 h-4 md:w-5 md:h-5" />
        </span>
      ))}
    </div>
  );
}

const PHASE_LABEL: Record<UiSnapshot["phase"], string> = {
  idle: "—",
  plan: "ПЛАН БОЯ",
  thinking: "ВРАГ ЗАМЫШЛЯЕТ",
  resolve: "РАЗРЕШЕНИЕ",
  ko: "ФИНАЛ",
};

// ---------------------------------------------------------------- screens

function Codex() {
  return (
    <div>
      <p className="font-pixel text-[9px] md:text-[10px] text-steel mb-2 tracking-wider">КОДЕКС КЛИНКА</p>
      <div className="grid sm:grid-cols-2 gap-1.5">
        {ACTIONS.map((a) => {
          const m = ACTION_META[a];
          return (
            <div key={a} className="flex items-start gap-2 px-panel px-2 py-1.5 bg-ink2/80">
              <span className="shrink-0 mt-0.5 w-7 h-7 flex items-center justify-center border-2 border-[#070919]" style={{ background: m.dark, color: m.color }}>
                <ActionIcon action={a} className="w-4 h-4" />
              </span>
              <span>
                <span className="block font-pixel leading-tight" style={{ color: m.color, fontSize: 8 }}>
                  {m.name.toUpperCase()}
                </span>
                <span className="block font-body text-[11px] leading-tight text-dim">{m.desc}</span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="font-pixel text-[7px] md:text-[8px] text-dim mt-2 leading-relaxed">
        3 HP · УРОН 1 · УДАР ДОСТАЁТ С ДИСТАНЦИИ 1 · ПРЫЖОК ЗА КРАЙ ПОМОСТА = ПРОПАСТЬ
      </p>
    </div>
  );
}

function ThreatSkulls({ n, color }: { n: number; color: string }) {
  return (
    <div className="flex gap-0.5" style={{ color }}>
      {[1, 2, 3, 4].map((i) => (
        <IconSkull key={i} className={`w-4 h-4 ${i <= n ? "" : "opacity-20"}`} />
      ))}
    </div>
  );
}

interface NetPanelProps {
  state: "off" | "hosting" | "joining" | "connected";
  code: string;
  join: string;
  setJoin: (v: string) => void;
  error: string;
  onCreate: () => void;
  onJoin: () => void;
  onCancel: () => void;
}

function MenuScreen({
  pers,
  setPers,
  onStart,
  netPanel,
}: {
  pers: MenuChoice;
  setPers: (p: MenuChoice) => void;
  onStart: () => void;
  netPanel: NetPanelProps;
}) {
  const [rulesOpen, setRulesOpen] = useState(false);
  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-[#070919]/85 anim-overlay">
      <div className="min-h-full flex items-center justify-center p-3 md:p-6">
        <div className="w-full max-w-sm md:max-w-md anim-rise">
          {/* title strip */}
          <div className="flex items-end justify-between gap-2 mb-2 select-none">
            <h1 className="font-pixel leading-none whitespace-nowrap">
              <span className="text-[24px] md:text-[30px] text-gold drop-shadow-[3px_3px_0_#070919]">BLADE</span>{" "}
              <span className="text-[24px] md:text-[30px] text-blood drop-shadow-[3px_3px_0_#070919]">STEP</span>
            </h1>
            <span className="font-pixel text-[6px] md:text-[7px] text-blade pb-1 text-right leading-relaxed">
              одновременная дуэль<br />6 клеток · 3 HP
            </span>
          </div>

          {/* fight select */}
          <div className="px-panel p-2.5 md:p-3 bg-panel">
            <p className="font-pixel text-[9px] text-paper mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-blood inline-block anim-blink" />
              ВЫБЕРИ СОПЕРНИКА
            </p>
            <div className="flex flex-col gap-1.5">
              {(Object.keys(PERSONALITIES) as Personality[]).map((p) => {
                const m = PERSONALITIES[p];
                const sel = pers === p;
                return (
                  <button
                    key={p}
                    onClick={() => {
                      initAudio();
                      sfx.select();
                      setPers(p);
                    }}
                    className={`no-select text-left border-[3px] border-[#070919] px-2.5 py-1.5 transition-all duration-100 ${
                      sel ? "translate-x-1 bg-ink" : "bg-ink2 hover:bg-ink hover:translate-x-0.5"
                    }`}
                    style={sel ? { boxShadow: `inset 0 0 0 2px ${m.color}, 0 0 14px ${m.color}44` } : undefined}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-pixel text-[10px] md:text-[11px]" style={{ color: m.color }}>
                        {m.name}
                      </span>
                      <ThreatSkulls n={m.threat} color={m.color} />
                    </span>
                    <span className="block font-body text-[10px] text-dim mt-0.5 leading-tight">
                      {m.title} · <span className="italic opacity-80">{m.quote}</span>
                    </span>
                  </button>
                );
              })}

              {/* random opponent */}
              <button
                onClick={() => {
                  initAudio();
                  sfx.select();
                  setPers("any");
                }}
                className={`no-select text-left border-[3px] border-[#070919] px-2.5 py-1.5 transition-all duration-100 ${
                  pers === "any" ? "translate-x-1 bg-ink" : "bg-ink2 hover:bg-ink hover:translate-x-0.5"
                }`}
                style={
                  pers === "any"
                    ? { boxShadow: "inset 0 0 0 2px #3ddad7, 0 0 14px rgba(61,218,215,0.3)" }
                    : undefined
                }
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-pixel text-[10px] md:text-[11px] text-[#3ddad7]">СЛУЧАЙ</span>
                  <span className="font-pixel text-[12px] text-[#3ddad7] anim-blink">?</span>
                </span>
                <span className="block font-body text-[10px] text-dim mt-0.5 leading-tight">
                  Испытание судьбы · <span className="italic opacity-80">«Кого пришлёт помост — того и встретишь»</span>
                </span>
              </button>
            </div>
            <button
              onClick={onStart}
              disabled={netPanel.state !== "off"}
              className="px-btn no-select w-full mt-2.5 py-2.5 md:py-3 bg-blood text-paper text-[12px] md:text-[13px] tracking-widest"
            >
              К БОЮ
            </button>

            {/* ---- сетевая дуэль ---- */}
            <div className="mt-3 pt-2.5 border-t-2 border-dashed border-[#39406e]">
              <p className="font-pixel text-[9px] text-[#3ddad7] mb-2 flex items-center gap-2">
                <span className="w-2 h-2 bg-[#3ddad7] inline-block anim-blink" />
                СЕТЕВАЯ ДУЭЛЬ (P2P)
              </p>

              {netPanel.state === "off" && (
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={netPanel.onCreate}
                    className="px-btn no-select w-full py-2 bg-[#0e6b69] text-paper text-[10px] tracking-wider"
                  >
                    СОЗДАТЬ КОМНАТУ
                  </button>
                  <div className="flex gap-1.5">
                    <input
                      value={netPanel.join}
                      onChange={(e) => netPanel.setJoin(e.target.value.toUpperCase().slice(0, 4))}
                      placeholder="КОД"
                      className="font-pixel flex-1 min-w-0 px-2 py-2 bg-ink2 border-2 border-[#070919] text-[#3ddad7] text-[11px] tracking-[0.3em] text-center placeholder:text-[#39406e] placeholder:tracking-normal outline-none focus:border-[#3ddad7]"
                    />
                    <button
                      onClick={netPanel.onJoin}
                      className="px-btn no-select px-4 py-2 bg-panel text-paper text-[10px]"
                    >
                      ВОЙТИ
                    </button>
                  </div>
                  {netPanel.error && (
                    <p className="font-body text-[10px] text-blood leading-tight">{netPanel.error}</p>
                  )}
                  <p className="font-body text-[9px] text-dim/70 leading-tight">
                    Друг создаёт комнату и диктует код — вы входите по нему. Нужен интернет.
                  </p>
                </div>
              )}

              {netPanel.state === "hosting" && (
                <div className="text-center">
                  <p className="font-body text-[10px] text-dim mb-1">Код комнаты:</p>
                  <p className="font-pixel text-[26px] text-[#3ddad7] tracking-[0.25em] mb-1.5 drop-shadow-[3px_3px_0_#070919]">
                    {netPanel.code}
                  </p>
                  <p className="font-body text-[10px] text-dim mb-2">
                    Ждём второго бойца… <span className="anim-blink">▮</span>
                  </p>
                  <button onClick={netPanel.onCancel} className="px-btn no-select px-4 py-1.5 bg-panel text-dim text-[9px]">
                    ОТМЕНА
                  </button>
                </div>
              )}

              {netPanel.state === "joining" && (
                <div className="text-center">
                  <p className="font-body text-[10px] text-dim mb-2">
                    Подключаемся к комнате <span className="text-[#3ddad7] font-pixel">{netPanel.join}</span>…{" "}
                    <span className="anim-blink">▮</span>
                  </p>
                  {netPanel.error && (
                    <p className="font-body text-[10px] text-blood leading-tight mb-2">{netPanel.error}</p>
                  )}
                  <button onClick={netPanel.onCancel} className="px-btn no-select px-4 py-1.5 bg-panel text-dim text-[9px]">
                    ОТМЕНА
                  </button>
                </div>
              )}

              {netPanel.state === "connected" && (
                <div className="text-center">
                  <p className="font-pixel text-[11px] text-gold mb-1">СОПЕРНИК НАЙДЕН!</p>
                  <p className="font-body text-[10px] text-dim">Бой начинается…</p>
                </div>
              )}
            </div>
          </div>

          {/* rules: collapsed by default */}
          <button
            onClick={() => {
              initAudio();
              sfx.tick();
              setRulesOpen((o) => !o);
            }}
            className="px-btn no-select w-full mt-1.5 px-3 py-2 bg-panel text-paper text-[9px] flex items-center justify-between"
          >
            <span>ПРАВИЛА И КУБИКИ</span>
            <span className={`inline-block text-gold transition-transform duration-150 ${rulesOpen ? "rotate-180" : ""}`}>▼</span>
          </button>
          {rulesOpen && (
            <div className="px-panel mt-1 p-2.5 bg-panel anim-rise">
              <p className="font-body text-[11px] text-dim leading-snug mb-2">
                Оба бойца бросают по <span className="text-paper">6 кубиков</span> — руки открыты, но каждый тайно выбирает{" "}
                <span className="text-paper">3</span>. Кубики вскрываются по одному, бойцы действуют{" "}
                <span className="text-paper">одновременно</span>. За краем помоста — пропасть.
              </p>
              <Codex />
            </div>
          )}

          <p className="font-body text-[9px] text-dim/70 text-center mt-2">
            [1–6] взять кубик · [Enter] бой · [Esc] пауза · [M] звук · [N] музыка
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCell({ v, label, color }: { v: number; label: string; color?: string }) {
  return (
    <div className="px-panel bg-ink2 px-2 py-2 text-center">
      <span className="block font-pixel text-[15px] md:text-[18px]" style={{ color: color ?? "#f2eeda" }}>
        {v}
      </span>
      <span className="block font-body text-[10px] text-dim mt-1">{label}</span>
    </div>
  );
}

function OverScreen({
  result,
  stats,
  enemyName,
  onRematch,
  onMenu,
  rematchLabel = "РЕВАНШ",
}: {
  result: GameResult;
  stats: MatchStats;
  enemyName: string;
  onRematch: () => void;
  onMenu: () => void;
  rematchLabel?: string;
}) {
  const map = {
    win: { text: "ПОБЕДА", color: "#ffc24b", line: `${enemyName} повержен. Помост твой.` },
    lose: { text: "ПОРАЖЕНИЕ", color: "#ff4757", line: `${enemyName} оказался быстрее. Встань и вернись.` },
    draw: { text: "НИЧЬЯ", color: "#aebbdd", line: "Помост расступился под обоими. Никто не победил." },
  }[result];
  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-[#070919]/80 anim-overlay">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-lg anim-rise">
          <p className="font-pixel text-[9px] text-dim text-center mb-2">ДУЭЛЬ ОКОНЧЕНА</p>
          <h2
            className="anim-slam font-pixel text-center text-[30px] md:text-[46px] leading-none mb-2"
            style={{ color: map.color, textShadow: "4px 4px 0 #070919" }}
          >
            {map.text}
          </h2>
          <p className="font-body text-[12px] text-dim text-center mb-4">{map.line}</p>
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            <StatCell v={stats.exchanges} label="обмены" />
            <StatCell v={stats.dealt} label="урон" color="#ffc24b" />
            <StatCell v={stats.taken} label="получено" color="#ff4757" />
            <StatCell v={stats.blocks} label="блоки" color="#aebbdd" />
            <StatCell v={stats.dodges} label="уклоны" color="#b08cff" />
            <StatCell v={stats.whiffs} label="промахи" color="#8f96c4" />
            <StatCell v={stats.leaps} label="прыжки" color="#3ddad7" />
            <StatCell v={stats.dealt - stats.taken} label="разница" color="#3ddad7" />
          </div>
          <div className="flex gap-2">
            <button onClick={onRematch} className="px-btn no-select flex-1 py-3 bg-gold text-[#070919] text-[10px] md:text-[12px] flex items-center justify-center gap-2">
              <IconRetry className="w-4 h-4" /> {rematchLabel}
            </button>
            <button onClick={onMenu} className="px-btn no-select flex-1 py-3 bg-panel text-paper text-[12px] flex items-center justify-center gap-2">
              <IconHome className="w-4 h-4" /> В МЕНЮ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- app

export default function App() {
  const engineRef = useRef<Engine | null>(null);
  if (!engineRef.current) engineRef.current = new Engine();
  const engine = engineRef.current;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ui, setUi] = useState<UiSnapshot>(initialUi);
  // each slot stores an index into the rolled player hand (or null)
  const [slots, setSlots] = useState<(number | null)[]>([null, null, null]);
  const [pers, setPers] = useState<MenuChoice>("aggressor");
  const [muted, setMutedState] = useState(isMuted());
  const [music, setMusicState] = useState(isMusicOn());
  const [paused, setPaused] = useState(false);

  // ---- сетевая дуэль ----
  const [netState, setNetState] = useState<"off" | "hosting" | "joining" | "connected">("off");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [netPeerName, setNetPeerName] = useState("Соперник");
  const [netError, setNetError] = useState("");
  const [netDrop, setNetDrop] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20);
  const [oppWantsRematch, setOppWantsRematch] = useState(false);
  const [rematchSent, setRematchSent] = useState(false);
  const myRematchRef = useRef(false);
  const oppRematchRef = useRef(false);
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  const resetNetUi = useCallback(() => {
    setNetState("off");
    setRoomCode("");
    setJoinCode("");
    setNetError("");
    setNetPeerName("Соперник");
    myRematchRef.current = false;
    oppRematchRef.current = false;
    setOppWantsRematch(false);
    setRematchSent(false);
  }, []);

  const beginNetMatch = useCallback(() => {
    initAudio();
    setPaused(false);
    engine.paused = false;
    setSlots([null, null, null]);
    myRematchRef.current = false;
    oppRematchRef.current = false;
    setOppWantsRematch(false);
    setRematchSent(false);
    engine.startNetMatch(uiRef.current.netPeer ?? "Соперник");
  }, [engine]);

  useEffect(() => {
    engine.setListener((patch) => setUi((u) => ({ ...u, ...patch })));
    if (canvasRef.current) engine.attach(canvasRef.current);
    engine.netSend = (m) => net.send(m);
    return () => {
      engine.detach();
      net.teardown();
    };
  }, [engine]);

  // сетевые события: подключение, сообщения, разрыв
  useEffect(() => {
    const hooks = {
      onCode: (code: string) => {
        setRoomCode(code);
        setNetState("hosting");
        setNetError("");
      },
      onConnected: (_name: string, isHost: boolean) => {
        setNetState("connected");
        setNetError("");
        sfx.win();
        if (isHost) {
          net.send({ t: "begin" });
          window.setTimeout(beginNetMatch, 2200);
        }
      },
      onMsg: (m: NetMsg) => {
        if (m.t === "hello") {
          setNetPeerName(m.name || "Соперник");
        } else if (m.t === "begin") {
          window.setTimeout(beginNetMatch, 1900);
        } else if (m.t === "hand") {
          engine.receiveNetHand(m.hand as Action[]);
        } else if (m.t === "plan") {
          engine.receiveNetPlan(m.plan as Action[]);
        } else if (m.t === "rematch") {
          oppRematchRef.current = true;
          setOppWantsRematch(true);
          sfx.select();
          if (myRematchRef.current) beginNetMatch();
        } else if (m.t === "quit") {
          if (uiRef.current.screen !== "menu") {
            engine.toMenu();
            setNetDrop(true);
          }
          net.teardown();
          resetNetUi();
        }
      },
      onDrop: () => {
        if (uiRef.current.screen !== "menu") {
          engine.toMenu();
          setNetDrop(true);
        }
        resetNetUi();
      },
      onError: (msg: string) => {
        setNetError(msg);
        setNetState("off");
        setRoomCode("");
      },
    };
    net.setHooks(hooks);
  }, [engine, beginNetMatch, resetNetUi]);

  // скрыть уведомление о разрыве через 3.5 с
  useEffect(() => {
    if (!netDrop) return;
    const t = window.setTimeout(() => setNetDrop(false), 3500);
    return () => window.clearTimeout(t);
  }, [netDrop]);

  // таймер 20 секунд на планирование (сетевая игра)
  useEffect(() => {
    if (!(ui.screen === "play" && ui.mode === "net" && ui.phase === "plan")) return;
    setTimeLeft(20);
    const iv = window.setInterval(() => setTimeLeft((t) => Math.max(0, t - 0.1)), 100);
    return () => window.clearInterval(iv);
  }, [ui.screen, ui.mode, ui.phase, ui.round]);

  useEffect(() => {
    if (!(ui.screen === "play" && ui.mode === "net" && ui.phase === "plan")) return;
    if (timeLeft > 0) return;
    // время вышло: незаполненные слоты становятся «стойкой»
    const plan = slotsRef.current.map((i) =>
      i === null ? "wait" : uiRef.current.playerHand[i] ?? "wait"
    ) as Action[];
    sfx.ko();
    engine.commitNetPlan(plan);
    setSlots([null, null, null]);
  }, [timeLeft, ui.screen, ui.mode, ui.phase, engine]);

  const selectHandDie = useCallback(
    (handIdx: number) => {
      if (ui.phase !== "plan") return;
      if (handIdx < 0 || handIdx >= ui.playerHand.length) return;
      initAudio();
      setSlots((s) => {
        const at = s.indexOf(handIdx);
        if (at >= 0) {
          sfx.back();
          const n = [...s];
          n[at] = null;
          return n;
        }
        const empty = s.indexOf(null);
        if (empty < 0) {
          sfx.bump();
          return s;
        }
        sfx.slot();
        const n = [...s];
        n[empty] = handIdx;
        return n;
      });
    },
    [ui.phase, ui.playerHand]
  );

  const clearSlots = useCallback(() => {
    if (ui.phase !== "plan") return;
    sfx.back();
    setSlots([null, null, null]);
  }, [ui.phase]);

  const ready = slots.every((s) => s !== null);

  const fight = useCallback(() => {
    if (ui.phase !== "plan" || !ready) return;
    initAudio();
    sfx.fight();
    const plan = slots.map((i) => (i === null ? "fwd" : ui.playerHand[i] ?? "fwd")) as Action[];
    if (ui.mode === "net") engine.commitNetPlan(plan);
    else engine.fight(plan);
    setSlots([null, null, null]);
  }, [ui.phase, ui.mode, ready, slots, ui.playerHand, engine]);

  const startMatch = useCallback(() => {
    if (netState === "connected" || netState === "hosting" || netState === "joining") return;
    initAudio();
    setPaused(false);
    engine.paused = false;
    setSlots([null, null, null]);
    const all: Personality[] = ["random", "aggressor", "controller", "mirror"];
    const choice = pers === "any" ? all[Math.floor(Math.random() * all.length)] : pers;
    engine.startMatch(choice);
  }, [engine, pers, netState]);

  // ---- сетевые действия из меню ----
  const createRoom = useCallback(() => {
    initAudio();
    sfx.select();
    setNetError("");
    setJoinCode("");
    net.host();
    setNetState("hosting");
  }, []);

  const joinRoom = useCallback(() => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setNetError("Введите код комнаты (4 символа).");
      return;
    }
    initAudio();
    sfx.select();
    setNetError("");
    net.join(code);
    setNetState("joining");
  }, [joinCode]);

  const cancelNet = useCallback(() => {
    net.send({ t: "quit" });
    net.teardown();
    resetNetUi();
    sfx.back();
  }, [resetNetUi]);

  const togglePause = useCallback(() => {
    if (ui.screen !== "play") return;
    initAudio();
    setPaused((p) => {
      engine.paused = !p;
      sfx.tick();
      return !p;
    });
  }, [engine, ui.screen]);

  const quitToMenu = useCallback(() => {
    engine.paused = false;
    setPaused(false);
    if (net.connected) {
      net.send({ t: "quit" });
      net.teardown();
      resetNetUi();
    }
    setNetDrop(false);
    engine.toMenu();
  }, [engine, resetNetUi]);

  /** Реванш: в сетевой игре нужно согласие обоих. */
  const requestRematch = useCallback(() => {
    if (uiRef.current.mode !== "net") {
      startMatch();
      return;
    }
    if (myRematchRef.current) return; // уже ждём
    initAudio();
    sfx.select();
    myRematchRef.current = true;
    setRematchSent(true);
    net.send({ t: "rematch" });
    if (oppRematchRef.current) beginNetMatch();
  }, [startMatch, beginNetMatch]);

  const toggleMute = useCallback(() => {
    initAudio();
    const m = !isMuted();
    setMuted(m);
    setMutedState(m);
    if (!m) sfx.tick();
  }, []);

  const toggleMusic = useCallback(() => {
    initAudio();
    const on = !isMusicOn();
    setMusicOn(on);
    setMusicState(on);
    if (on) sfx.tick();
  }, []);

  // keyboard
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Enter" && ev.target instanceof HTMLButtonElement) return; // native click handles it
      if (ev.key >= "1" && ev.key <= "6") {
        selectHandDie(Number(ev.key) - 1);
      } else if (ev.key === "Backspace" || ev.key.toLowerCase() === "x") {
        if (ui.phase === "plan") {
          ev.preventDefault();
          clearSlots();
        }
      } else if (ev.key === "Enter") {
        if (ui.screen === "menu") startMatch();
        else if (ui.screen === "over") requestRematch();
        else if (ui.phase === "plan") fight();
      } else if (ev.key === "Escape") {
        if (ui.screen === "play") togglePause();
      } else if (ev.key.toLowerCase() === "m") {
        toggleMute();
      } else if (ev.key.toLowerCase() === "n") {
        toggleMusic();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectHandDie, clearSlots, fight, startMatch, requestRematch, togglePause, toggleMute, toggleMusic, ui.phase, ui.screen]);

  const enemyMeta = PERSONALITIES[ui.personality];
  const inGame = ui.screen !== "menu";

  const planning = ui.phase === "plan";
  const planDisplay: (Action | null)[] = planning
    ? slots.map((i) => (i === null ? null : ui.playerHand[i] ?? null))
    : ui.playerPlan;
  const badgeFor = (handIdx: number) => {
    const at = slots.indexOf(handIdx);
    return at >= 0 ? at + 1 : null;
  };

  return (
    <div className="h-full flex flex-col arena-bg scanlines relative overflow-hidden">
      {/* ---------- top HUD ---------- */}
      <header className="relative z-20 flex items-center justify-between gap-2 px-2 sm:px-4 md:px-6 py-1.5 md:py-2 border-b-[3px] border-[#070919] bg-[#151a33]/95">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-pixel text-[9px] md:text-[11px] text-gold whitespace-nowrap">РОНИН</span>
          <Pips hp={ui.pHp} />
        </div>
        <div className="text-center leading-tight">
          <span className="block font-pixel text-[9px] md:text-[11px] text-paper">
            РАУНД <span className="text-gold">{ui.round}</span>
          </span>
          <span className="block font-body text-[9px] md:text-[10px] text-dim">{PHASE_LABEL[ui.phase]}</span>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <Pips hp={ui.eHp} right />
          <span
            className="font-pixel text-[9px] md:text-[11px] whitespace-nowrap"
            style={{ color: ui.mode === "net" ? "#e63946" : enemyMeta.color }}
          >
            {ui.mode === "net" ? (ui.netPeer ?? "СОПЕРНИК") : enemyMeta.name}
          </span>
          <span className="hidden sm:flex items-center gap-1 ml-1">
            <button onClick={toggleMute} className="px-btn w-8 h-8 bg-panel text-paper flex items-center justify-center" aria-label="звук">
              {muted ? <IconMute className="w-4 h-4" /> : <IconSound className="w-4 h-4" />}
            </button>
            <button
              onClick={toggleMusic}
              className="px-btn w-8 h-8 bg-panel flex items-center justify-center"
              aria-label="музыка"
              title="Музыка [N]"
            >
              <IconMusic className={`w-4 h-4 ${music ? "text-gold" : "text-[#39406e]"}`} />
            </button>
            {inGame && (
              <>
                <button onClick={togglePause} className="px-btn w-8 h-8 bg-panel text-paper flex items-center justify-center" aria-label="пауза">
                  <IconPause className="w-4 h-4" />
                </button>
                <button onClick={quitToMenu} className="px-btn w-8 h-8 bg-panel text-paper flex items-center justify-center" aria-label="в меню">
                  <IconHome className="w-4 h-4" />
                </button>
              </>
            )}
          </span>
        </div>
      </header>

      {/* ---------- arena ---------- */}
      <main className="relative z-10 flex-1 min-h-0 flex items-center justify-center p-1.5 sm:p-2 md:p-3">
        <div
          className="relative max-w-[1080px] px-panel p-1 sm:p-1.5 bg-[#0a0d1d]"
          style={{ width: "min(100%, calc((100dvh - 310px) * 1.7778), 1080px)" }}
        >
          <canvas ref={canvasRef} className="block w-full h-auto" />
          {ui.banner && (
            <div key={ui.bannerId} className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span
                className="anim-slam font-pixel text-[24px] sm:text-[34px] md:text-[46px] text-paper"
                style={{ textShadow: "4px 4px 0 #070919, -2px -2px 0 #070919, 2px -2px 0 #070919, -2px 2px 0 #070919" }}
              >
                {ui.banner}
              </span>
            </div>
          )}
          {paused && ui.screen === "play" && (
            <div className="absolute inset-0 z-30 bg-[#070919]/80 flex flex-col items-center justify-center gap-4 anim-overlay">
              <p className="font-pixel text-[24px] md:text-[32px] text-paper" style={{ textShadow: "4px 4px 0 #000" }}>
                ПАУЗА
              </p>
              <button onClick={togglePause} className="px-btn px-6 py-3 bg-gold text-[#070919] text-[11px]">
                ПРОДОЛЖИТЬ
              </button>
              <button onClick={quitToMenu} className="px-btn px-6 py-3 bg-panel text-paper text-[11px]">
                ПОКИНУТЬ ПОМОСТ
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ---------- console ---------- */}
      <footer className="relative z-20 border-t-[3px] border-[#070919] bg-[#151a33]/95 px-2 sm:px-4 md:px-6 py-1.5 md:py-2">
        {inGame && (ui.phase === "plan" || ui.phase === "thinking") && (
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center justify-between gap-3 min-h-[18px] mb-1.5">
              <p key={ui.msgId} className="anim-msg font-body text-[11px] md:text-[12px] text-dim truncate">
                <span className="text-gold">▸</span> {ui.msg}
              </p>
              <p className="hidden md:block font-body text-[10px] text-dim/60 whitespace-nowrap">
                [1–6] взять кубик · [⌫] сброс · [Enter] бой
              </p>
            </div>

            {ui.mode === "net" && ui.phase === "plan" && (
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-pixel text-[8px] text-dim whitespace-nowrap">ВРЕМЯ</span>
                <div className="flex-1 h-3 border-2 border-[#070919] bg-ink2 relative overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 transition-[width] duration-100 ease-linear"
                    style={{
                      width: `${(timeLeft / 20) * 100}%`,
                      background:
                        timeLeft > 10 ? "#2a9d8f" : timeLeft > 5 ? "#e9c46a" : "#e63946",
                    }}
                  />
                  <div className="absolute inset-0 opacity-30 pointer-events-none" style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, transparent 0 9px, #070919 9px 10px)",
                  }} />
                </div>
                <span
                  className={`font-pixel text-[11px] w-8 text-right ${
                    timeLeft <= 5 ? "text-blood anim-blink" : "text-paper"
                  }`}
                >
                  {Math.ceil(timeLeft)}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-1.5 md:gap-2">
              {/* ---- PLAYER: hand -> plan ---- */}
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 md:gap-x-3">
                <span className="font-pixel text-[8px] md:text-[9px] text-gold w-12 text-right whitespace-nowrap">ВЫ<br />
                  <span className="text-[6px] text-dim">рука</span>
                </span>
                <div key={`ph-${ui.round}`} className="flex items-center gap-1">
                  {ui.playerHand.map((a, i) => (
                    <HandDie
                      key={i}
                      action={a}
                      badge={planning ? badgeFor(i) : null}
                      dimmed={planning && !slots.includes(i)}
                      onClick={planning ? () => selectHandDie(i) : undefined}
                      delay={i * 55}
                      hotkey={planning ? i + 1 : undefined}
                    />
                  ))}
                </div>
                <span className="font-pixel text-[10px] text-dim px-0.5">→</span>
                <span className="font-pixel text-[8px] md:text-[9px] text-gold whitespace-nowrap">план</span>
                <div className="flex items-center gap-1">
                  {planDisplay.map((a, i) =>
                    a ? (
                      <div key={`${ui.round}-${i}-${a}`} className="anim-pop">
                        <HandDie
                          action={a}
                          badge={i + 1}
                          roll={false}
                          onClick={planning && slots[i] !== null ? () => selectHandDie(slots[i] as number) : undefined}
                        />
                      </div>
                    ) : (
                      <div
                        key={`pe-${i}`}
                        className="w-10 h-12 sm:w-11 sm:h-[52px] border-2 border-dashed border-[#39406e] bg-ink2 flex items-center justify-center"
                      >
                        <span className="font-pixel text-[8px] text-[#39406e]">{i + 1}</span>
                      </div>
                    )
                  )}
                </div>
                <div className="flex items-center gap-1.5 ml-1">
                  <button
                    onClick={fight}
                    disabled={!ready || !planning}
                    className="px-btn no-select px-4 md:px-5 py-2.5 md:py-3 bg-blood text-paper text-[11px] md:text-[12px] tracking-widest"
                  >
                    БОЙ!
                  </button>
                  <button
                    onClick={clearSlots}
                    className="px-btn no-select px-2 py-2.5 bg-panel text-dim text-[8px]"
                    disabled={!planning}
                  >
                    СБРОС
                  </button>
                </div>
              </div>

              {/* ---- ENEMY: hand -> hidden plan ---- */}
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 md:gap-x-3">
                <span
                  className="font-pixel text-[8px] md:text-[9px] w-12 text-right whitespace-nowrap"
                  style={{ color: enemyMeta.color }}
                >
                  {enemyMeta.name}
                  <br />
                  <span className="text-[6px] text-dim">рука</span>
                </span>
                <div key={`eh-${ui.round}`} className="flex items-center gap-1">
                  {ui.enemyHand.map((a, i) => (
                    <HandDie key={i} action={a} enemy delay={i * 55 + 40} />
                  ))}
                </div>
                <span className="font-pixel text-[10px] text-dim px-0.5">→</span>
                <span className="font-pixel text-[8px] md:text-[9px] whitespace-nowrap" style={{ color: enemyMeta.color }}>
                  замысел
                </span>
                <div className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="die w-10 h-12 sm:w-11 sm:h-[52px] flex items-center justify-center anim-dice-roll"
                      style={{ background: "#3a1020", animationDelay: `${i * 55 + 200}ms` }}
                    >
                      <span className="font-pixel text-blood opacity-70" style={{ fontSize: 12 }}>
                        ?
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {inGame && (ui.phase === "resolve" || ui.phase === "ko") && (
          <div className="mx-auto max-w-4xl">
            <div className="flex items-center justify-between gap-3 min-h-[18px] mb-1">
              <p key={ui.msgId} className="anim-msg font-body text-[11px] md:text-[12px] text-dim truncate">
                <span className="text-gold">▸</span> {ui.msg}
              </p>
              {ui.phase === "resolve" && (
                <span className="font-pixel text-[9px] md:text-[10px] text-gold whitespace-nowrap">
                  ШАГ {Math.min(3, ui.step + 1)}/3
                </span>
              )}
            </div>
            <div className="flex items-start justify-center gap-3 md:gap-10">
              <div className="flex items-start gap-1.5 md:gap-2">
                <span className="font-pixel text-[8px] md:text-[9px] text-gold mr-1 mt-3 sm:mt-4 whitespace-nowrap">ВЫ</span>
                {ui.playerPlan.map((a, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <FlipDie action={a} revealed big active={ui.step === i} done={ui.step > i} />
                    <span
                      className={`font-pixel leading-none ${ui.step === i ? "text-gold" : "text-[#39406e]"}`}
                      style={{ fontSize: 8 }}
                    >
                      {i + 1}
                    </span>
                  </div>
                ))}
              </div>
              <span className="font-pixel text-[12px] md:text-[14px] text-blood mt-4 sm:mt-6">VS</span>
              <div className="flex items-start gap-1.5 md:gap-2">
                {ui.enemyPlan.map((a, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <FlipDie
                      action={a}
                      revealed={i < ui.enemyRevealed}
                      big
                      active={ui.step === i}
                      done={ui.step > i}
                      backColor="#3a1020"
                    />
                    <span
                      className={`font-pixel leading-none ${ui.step === i ? "text-blood" : "text-[#39406e]"}`}
                      style={{ fontSize: 8 }}
                    >
                      {i + 1}
                    </span>
                  </div>
                ))}
                <span
                  className="font-pixel text-[8px] md:text-[9px] ml-1 mt-3 sm:mt-4 whitespace-nowrap"
                  style={{ color: enemyMeta.color }}
                >
                  {enemyMeta.name}
                </span>
              </div>
            </div>
          </div>
        )}

        {ui.screen === "menu" && (
          <p className="text-center font-pixel text-[8px] md:text-[9px] text-dim py-1">
            ПОМОСТ ЖДЁТ <span className="text-blood anim-blink">▮</span>
          </p>
        )}
      </footer>

      {/* ---------- overlays ---------- */}
      {ui.screen === "menu" && (
        <MenuScreen
          pers={pers}
          setPers={setPers}
          onStart={startMatch}
          netPanel={{
            state: netState,
            code: roomCode,
            join: joinCode,
            setJoin: setJoinCode,
            error: netError,
            onCreate: createRoom,
            onJoin: joinRoom,
            onCancel: cancelNet,
          }}
        />
      )}
      {ui.screen === "over" && ui.result && (
        <OverScreen
          result={ui.result}
          stats={ui.stats}
          enemyName={ui.mode === "net" ? "Соперник" : enemyMeta.name}
          onRematch={ui.mode === "net" ? requestRematch : startMatch}
          onMenu={quitToMenu}
          rematchLabel={
            ui.mode === "net"
              ? rematchSent
                ? oppWantsRematch
                  ? "РЕВАНШ!"
                  : "ЖДЁМ СОПЕРНИКА…"
                : oppWantsRematch
                  ? "СОПЕРНИК ЖДЁТ — РЕВАНШ!"
                  : "ПРЕДЛОЖИТЬ РЕВАНШ"
              : "РЕВАНШ"
          }
        />
      )}

      {/* уведомление о разрыве соединения */}
      {netDrop && ui.screen === "menu" && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-panel bg-[#3a1020] px-4 py-2 anim-rise">
          <p className="font-pixel text-[9px] text-blood">СОПЕРНИК ПОКИНУЛ ПОМОСТ</p>
        </div>
      )}
    </div>
  );
}
