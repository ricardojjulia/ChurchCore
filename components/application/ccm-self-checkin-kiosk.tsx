"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Alert,
  Box,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { AlertTriangle, Check, Lock, LogOut, Phone, QrCode, Hash } from "lucide-react";

import {
  exitKioskAction,
  getKioskOptionsAction,
  kioskCheckinAction,
  lookupByCodeAction,
  lookupByPhoneAction,
  releaseStuckKioskAction,
  type KioskCheckinResult,
} from "@/app/kiosk/children/actions";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSelect } from "@/components/language-select";
import { useIdleReset } from "@/components/application/use-idle-reset";
import { kioskWarningMs } from "@/lib/kiosk-idle";

const CcmQrScanner = dynamic(() => import("@/components/application/ccm-qr-scanner"), {
  ssr: false,
});

type Screen = "start" | "phone" | "code" | "scan" | "choose" | "success" | "locked";
type Child = { id: string; displayName: string; alreadyCheckedIn: boolean; needsGreeter: boolean };
type Results = Extract<KioskCheckinResult, { status: "done" }>["results"];
type Options = { service: { id: string; name: string } | null; rooms: Array<{ id: string; name: string }> };

const PRIMARY_H = 64;
const AUTO_RETURN_MS = 20_000;
const TARGET_H = 44;

export function CcmSelfCheckinKiosk({ idleMs, locked = false }: { idleMs: number; locked?: boolean }) {
  const { t } = useI18n();
  const k = useCallback((key: string, values?: Record<string, string | number>) => t("kiosk", key, values), [t]);

  const [screen, setScreen] = useState<Screen>(locked ? "locked" : "start");
  const [input, setInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [options, setOptions] = useState<Options | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [results, setResults] = useState<Results>([]);
  const [scanFailed, setScanFailed] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitPin, setExitPin] = useState("");
  const [exitMessage, setExitMessage] = useState<string | null>(null);
  const [exitBusy, setExitBusy] = useState(false);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [autoSeconds, setAutoSeconds] = useState<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);

  // Clears everything a family typed, saw or was given: the PIN, the household
  // token, the names. Unmounting the scanner (screen change) stops the camera.
  const resetAll = useCallback(() => {
    setScreen((current) => (current === "locked" ? current : "start"));
    setInput("");
    setMessage(null);
    setBusy(false);
    setToken(null);
    setChildren([]);
    setSelected([]);
    setOptions(null);
    setRoomId(null);
    setResults([]);
    setScanFailed(false);
    setExitOpen(false);
    setExitPin("");
    setExitMessage(null);
    setExitBusy(false);
    setAutoSeconds(null);
    inFlight.current = false;
  }, []);

  const idle = useIdleReset({
    // Also while the exit dialog is open on the start screen, so a half-typed PIN never stays on screen.
    enabled: screen !== "locked" && (screen !== "start" || exitOpen),
    idleMs,
    warningMs: kioskWarningMs(idleMs),
    onIdle: resetAll,
  });

  useEffect(() => {
    // Typing screens focus the field; every other screen focuses its heading.
    const target = screen === "phone" || screen === "code" ? inputRef.current : headingRef.current;
    target?.focus();
  }, [screen]);

  // The pickup PIN does not stay on a shared screen: back to the start after 20 s.
  useEffect(() => {
    if (screen !== "success") return;
    const deadline = Date.now() + AUTO_RETURN_MS;
    // State only changes from the timer and the cleanup (react-hooks/set-state-in-effect);
    // the render falls back to the full count until the first tick.
    const timer = window.setInterval(() => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        window.clearInterval(timer);
        resetAll();
      } else {
        setAutoSeconds(Math.ceil(remaining / 1000));
      }
    }, 500);
    return () => {
      window.clearInterval(timer);
      setAutoSeconds(null);
    };
  }, [screen, resetAll]);

  const goLocked = () => {
    resetAll();
    setScreen("locked");
  };

  const goto = (next: Screen) => {
    setInput("");
    setMessage(null);
    setScanFailed(false);
    setScreen(next);
  };

  async function handleFound(result: Awaited<ReturnType<typeof lookupByCodeAction>>) {
    if (result.status === "locked") return goLocked();
    if (result.status === "found") {
      setToken(result.householdToken);
      setChildren(result.children);
      setSelected([]);
      setRoomId(null);
      const opts = await getKioskOptionsAction();
      if (opts.status === "locked") return goLocked();
      const nextOptions =
        opts.status === "ok" ? { service: opts.service, rooms: opts.rooms } : { service: null, rooms: [] };
      setOptions(nextOptions);
      // A single room needs no tap.
      setRoomId(nextOptions.rooms.length === 1 ? nextOptions.rooms[0].id : null);
      setInput("");
      setMessage(null);
      setScreen("choose");
      return;
    }
    if (result.status === "paused") {
      setMessage(k("paused", { seconds: result.retryAfterSeconds }));
    } else if (result.status === "none") {
      setMessage(k("noMatch"));
    } else {
      setMessage(k("networkError"));
    }
  }

  async function runLookup(kind: "phone" | "code", value: string) {
    if (inFlight.current) return;
    if (!value.trim()) {
      setMessage(k("needInput"));
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result =
        kind === "phone" ? await lookupByPhoneAction({ phone: value }) : await lookupByCodeAction({ code: value });
      await handleFound(result);
    } catch {
      setMessage(k("networkError"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function submitCheckin() {
    if (inFlight.current || !token || !roomId || !options?.service || selected.length === 0) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await kioskCheckinAction({
        householdToken: token,
        childIds: selected,
        roomId,
        serviceId: options.service.id,
      });
      if (result.status === "locked") return goLocked();
      if (result.status === "done") {
        setResults(result.results);
        setToken(null);
        setScreen("success");
      } else if (result.status === "expired") {
        resetAll();
      } else {
        setMessage(k("networkError"));
      }
    } catch {
      setMessage(k("networkError"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function releaseDevice() {
    if (releaseBusy) return;
    setReleaseBusy(true);
    setMessage(null);
    try {
      const result = await releaseStuckKioskAction();
      if (result.status === "released") {
        // Full page load on purpose: the cleared cookies must reach the next request.
        window.location.assign(result.redirectTo);
        return;
      }
      if (result.status === "active") {
        // A valid kiosk exists after all: show it (leaving still needs the password).
        setMessage(k("releaseActive"));
        window.location.reload();
        return;
      }
      setMessage(k("releaseError"));
    } catch {
      setMessage(k("releaseError"));
    } finally {
      setReleaseBusy(false);
    }
  }

  async function submitExit() {
    if (exitBusy) return;
    setExitBusy(true);
    setExitMessage(null);
    try {
      const result = await exitKioskAction({ pin: exitPin });
      if (result.status === "exited") {
        // A full page load on purpose: it drops every piece of client state and picks up the cleared cookie.
        window.location.assign(result.redirectTo);
        return;
      }
      setExitPin("");
      if (result.status === "wrong_pin") setExitMessage(k("exitWrong"));
      else if (result.status === "paused") setExitMessage(k("exitPaused", { seconds: result.retryAfterSeconds }));
      else if (result.status === "locked") {
        setExitOpen(false);
        goLocked();
      } else setExitMessage(k("exitError"));
    } catch {
      setExitMessage(k("exitError"));
    } finally {
      setExitBusy(false);
    }
  }

  const heading = (text: string) => (
    <Title order={1} ref={headingRef} tabIndex={-1} ta="center" style={{ outline: "none" }}>
      {text}
    </Title>
  );

  const bigButton = {
    h: PRIMARY_H,
    size: "xl" as const,
    radius: "xl" as const,
    fullWidth: true,
    color: "indigo",
  };
  const smallButton = { mih: TARGET_H, h: TARGET_H, size: "md" as const, radius: "xl" as const };

  const errorAlert = message ? (
    <Alert role="alert" color="red" icon={<AlertTriangle size={20} />} radius="lg">
      <Text fw={600}>{message}</Text>
    </Alert>
  ) : null;

  const selectableChildren = children.filter((c) => !c.alreadyCheckedIn && !c.needsGreeter);

  return (
    <Box component="main" mih="100dvh" p="lg" style={{ display: "flex", flexDirection: "column" }}>
      <Group justify="space-between" align="center" wrap="nowrap" mb="lg">
        <Text fw={700} size="lg">
          {k("kioskTitle")}
        </Text>
        {screen === "start" ? (
          <Box w={200}>
            <LanguageSelect size="lg" />
          </Box>
        ) : null}
        {screen !== "locked" ? (
          <Button
            {...smallButton}
            variant="default"
            leftSection={<LogOut size={16} />}
            onClick={() => {
              setExitMessage(null);
              setExitPin("");
              setExitOpen(true);
            }}
          >
            {k("exitKiosk")}
          </Button>
        ) : null}
      </Group>

      <Stack gap="xl" maw={720} w="100%" mx="auto" style={{ flex: 1, justifyContent: "center" }}>
        {screen === "locked" ? (
          <Stack gap="lg" align="center">
            <Lock size={48} aria-hidden />
            {heading(k("lockedHeading"))}
            <Text ta="center" size="lg">
              {k("lockedBody")}
            </Text>
            <Button component="a" href="/sign-in" {...bigButton} data-primary-action>
              {k("lockedSignIn")}
            </Button>
            {errorAlert}
            <Button {...smallButton} variant="default" loading={releaseBusy} onClick={() => void releaseDevice()}>
              {k("releaseDevice")}
            </Button>
            <Text ta="center" size="sm" c="dimmed">
              {k("releaseHelp")}
            </Text>
          </Stack>
        ) : null}

        {screen === "start" ? (
          <Stack gap="lg">
            {heading(k("startHeading"))}
            <Button {...bigButton} leftSection={<Phone size={22} />} onClick={() => goto("phone")} data-primary-action>
              {k("startPhoneButton")}
            </Button>
            <Button {...bigButton} leftSection={<Hash size={22} />} onClick={() => goto("code")} data-primary-action>
              {k("startCodeButton")}
            </Button>
            <Button {...bigButton} leftSection={<QrCode size={22} />} onClick={() => goto("scan")} data-primary-action>
              {k("startScanButton")}
            </Button>
            <Text ta="center" c="dimmed">
              {k("startHelp")}
            </Text>
          </Stack>
        ) : null}

        {screen === "phone" || screen === "code" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runLookup(screen === "phone" ? "phone" : "code", input);
            }}
          >
            <Stack gap="lg">
              {heading(k(screen === "phone" ? "phoneHeading" : "codeHeading"))}
              {screen === "phone" ? (
                <TextInput
                  size="xl"
                  radius="lg"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  label={k("phoneLabel")}
                  description={k("phoneHint")}
                  value={input}
                  ref={inputRef}
                  onChange={(e) => setInput(e.currentTarget.value)}
                />
              ) : (
                <TextInput
                  size="xl"
                  radius="lg"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  label={k("codeLabel")}
                  description={k("codeHint")}
                  value={input}
                  maxLength={16}
                  styles={{ input: { textTransform: "uppercase", letterSpacing: "0.2em" } }}
                  ref={inputRef}
                  onChange={(e) => setInput(e.currentTarget.value.toUpperCase())}
                />
              )}
              {errorAlert}
              <Button type="submit" {...bigButton} loading={busy} data-primary-action>
                {busy ? k("looking") : k("lookup")}
              </Button>
              <Button {...smallButton} variant="default" onClick={() => goto("start")}>
                {k("back")}
              </Button>
            </Stack>
          </form>
        ) : null}

        {screen === "scan" ? (
          <Stack gap="lg">
            {heading(k("scanHeading"))}
            {scanFailed ? (
              <Alert role="alert" color="yellow" icon={<AlertTriangle size={20} />} radius="lg">
                <Text fw={600}>{k("scanDenied")}</Text>
              </Alert>
            ) : (
              <>
                <Text ta="center" size="lg">
                  {k("scanHelp")}
                </Text>
                <CcmQrScanner
                  label={k("scanCameraLabel")}
                  onUnavailable={() => setScanFailed(true)}
                  onCode={(value) => {
                    setInput(value.slice(0, 64));
                    void runLookup("code", value.slice(0, 64));
                  }}
                />
              </>
            )}
            {errorAlert}
            <Button {...bigButton} variant={scanFailed ? "filled" : "default"} onClick={() => goto("code")} data-primary-action>
              {k("scanTypeCode")}
            </Button>
            <Button {...smallButton} variant="default" onClick={() => goto("start")}>
              {k("back")}
            </Button>
          </Stack>
        ) : null}

        {screen === "choose" ? (
          <Stack gap="lg">
            {heading(k("chooseHeading"))}
            {!options?.service ? (
              <Alert role="alert" color="yellow" icon={<AlertTriangle size={20} />} radius="lg">
                <Text fw={600}>{k("noService")}</Text>
              </Alert>
            ) : (
              <Text ta="center" size="lg">
                {k("chooseHelp")}
              </Text>
            )}
            <Stack gap="sm" role="group" aria-label={k("chooseHeading")}>
              {children.map((child) => {
                const isSelected = selected.includes(child.id);
                const disabled = child.alreadyCheckedIn || child.needsGreeter || !options?.service;
                // Selection is announced by aria-pressed and shown by the filled button and check icon.
                const status = child.needsGreeter
                  ? k("childGreeter")
                  : child.alreadyCheckedIn
                    ? k("childAlreadyIn")
                    : null;
                return (
                  <Button
                    key={child.id}
                    h={72}
                    mih={TARGET_H}
                    size="xl"
                    radius="lg"
                    variant={isSelected ? "filled" : "default"}
                    color="indigo"
                    fullWidth
                    disabled={disabled}
                    aria-pressed={isSelected}
                    leftSection={isSelected ? <Check size={22} /> : undefined}
                    onClick={() =>
                      setSelected((prev) => (prev.includes(child.id) ? prev.filter((id) => id !== child.id) : [...prev, child.id]))
                    }
                  >
                    <Group justify="space-between" w="100%" wrap="nowrap">
                      <span>{child.displayName}</span>
                      {status ? <Text span size="sm">{status}</Text> : null}
                    </Group>
                  </Button>
                );
              })}
            </Stack>
            {options?.service && selectableChildren.length === 0 ? (
              <Text ta="center" c="dimmed">
                {k("noChildrenToCheckIn")}
              </Text>
            ) : null}
            {options?.service && selectableChildren.length > 0 ? (
              options.rooms.length === 0 ? (
                <Alert role="alert" color="yellow" icon={<AlertTriangle size={20} />} radius="lg">
                  <Text fw={600}>{k("noRooms")}</Text>
                </Alert>
              ) : (
                <Stack gap="sm" role="group" aria-label={k("roomHeading")}>
                  <Title order={2} size="h3" ta="center">
                    {k("roomHeading")}
                  </Title>
                  {options.rooms.map((room) => (
                    <Button
                      key={room.id}
                      h={56}
                      mih={TARGET_H}
                      size="lg"
                      radius="lg"
                      fullWidth
                      color="indigo"
                      variant={roomId === room.id ? "filled" : "default"}
                      aria-pressed={roomId === room.id}
                      leftSection={roomId === room.id ? <Check size={20} /> : undefined}
                      onClick={() => setRoomId(room.id)}
                    >
                      {room.name}
                    </Button>
                  ))}
                </Stack>
              )
            ) : null}
            {errorAlert}
            <Button
              {...bigButton}
              loading={busy}
              disabled={!options?.service || selected.length === 0 || !roomId}
              onClick={() => void submitCheckin()}
              data-primary-action
            >
              {busy ? k("checkingIn") : selected.length > 0 ? k("checkInCount", { count: selected.length }) : k("checkIn")}
            </Button>
            <Button {...smallButton} variant="default" onClick={resetAll}>
              {k("back")}
            </Button>
          </Stack>
        ) : null}

        {screen === "success" ? (
          <Stack gap="lg">
            {heading(k("successHeading"))}
            {results.map((result) => (
              <Box
                key={result.childId}
                p="lg"
                style={{ border: "2px solid var(--mantine-color-indigo-5)", borderRadius: 16 }}
              >
                {result.status === "checked_in" && result.pin ? (
                  <Stack gap={4} align="center">
                    <Text fw={600} size="lg">
                      {k("pinFor", { name: result.displayName })}
                    </Text>
                    <Text
                      fw={800}
                      data-testid="kiosk-pin"
                      aria-hidden
                      style={{ fontSize: 72, letterSpacing: "0.15em", lineHeight: 1.1 }}
                    >
                      {result.pin}
                    </Text>
                    <VisuallyHidden>{result.pin.split("").join(" ")}</VisuallyHidden>
                    {result.roomName ? <Text c="dimmed">{k("pinRoom", { room: result.roomName })}</Text> : null}
                  </Stack>
                ) : (
                  <Text fw={600} size="lg" ta="center">
                    {k(
                      result.status === "already"
                        ? "resultAlready"
                        : result.status === "closed"
                          ? "resultClosed"
                          : "resultGreeter",
                      { name: result.displayName || "" },
                    )}
                  </Text>
                )}
              </Box>
            ))}
            {results.some((r) => r.status === "checked_in") ? (
              <Text ta="center" size="lg">
                {k("pinNote")}
              </Text>
            ) : null}
            <>
              {/* Visible countdown; screen readers hear one static line, not every second. */}
              <Text ta="center" c="dimmed" aria-hidden data-testid="kiosk-auto-return">
                {k("autoReturn", { seconds: autoSeconds ?? Math.ceil(AUTO_RETURN_MS / 1000) })}
              </Text>
              <VisuallyHidden role="status">
                {k("autoReturn", { seconds: Math.ceil(AUTO_RETURN_MS / 1000) })}
              </VisuallyHidden>
            </>
            <Button {...bigButton} onClick={resetAll} data-primary-action>
              {k("done")}
            </Button>
          </Stack>
        ) : null}
      </Stack>

      <Modal
        opened={idle.warning}
        onClose={idle.stayActive}
        withCloseButton={false}
        closeOnClickOutside={false}
        closeOnEscape={false}
        centered
        title={k("idleWarningTitle")}
        radius="lg"
        trapFocus
        zIndex={400}
      >
        <Stack gap="lg">
          <Text size="lg" aria-hidden>
            {k("idleWarningBody", { seconds: idle.secondsLeft })}
          </Text>
          <VisuallyHidden role="status">{k("idleWarningAnnounce")}</VisuallyHidden>
          <Button {...bigButton} onClick={idle.stayActive}>
            {k("idleStay")}
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={exitOpen}
        onClose={() => {
          setExitOpen(false);
          setExitPin("");
        }}
        withCloseButton={false}
        centered
        radius="lg"
        title={k("exitTitle")}
        zIndex={300}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitExit();
          }}
        >
          <Stack gap="md">
            <Text>{k("exitDescription")}</Text>
            <TextInput
              size="lg"
              type="password"
              inputMode="numeric"
              maxLength={6}
              label={k("exitPasswordLabel")}
              value={exitPin}
              autoComplete="off"
              onChange={(e) => setExitPin(e.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
              data-autofocus
            />
            {exitMessage ? (
              <Alert role="alert" color="red" icon={<AlertTriangle size={20} />} radius="lg">
                <Text fw={600}>{exitMessage}</Text>
              </Alert>
            ) : null}
            <Button type="submit" {...bigButton} loading={exitBusy} disabled={exitPin.length !== 6}>
              {k("exitConfirm")}
            </Button>
            <Button
              {...smallButton}
              variant="default"
              onClick={() => {
                setExitOpen(false);
                setExitPin("");
              }}
            >
              {k("exitCancel")}
            </Button>
          </Stack>
        </form>
      </Modal>
    </Box>
  );
}
