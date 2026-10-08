"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Alert,
  Box,
  Button,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
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
  const [exitPassword, setExitPassword] = useState("");
  const [exitMessage, setExitMessage] = useState<string | null>(null);
  const [exitBusy, setExitBusy] = useState(false);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
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
    setExitPassword("");
    setExitMessage(null);
    setExitBusy(false);
    inFlight.current = false;
  }, []);

  const idle = useIdleReset({
    enabled: screen !== "start" && screen !== "locked",
    idleMs,
    warningMs: kioskWarningMs(idleMs),
    onIdle: resetAll,
  });

  useEffect(() => {
    headingRef.current?.focus();
  }, [screen]);

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
      setOptions(opts.status === "ok" ? { service: opts.service, rooms: opts.rooms } : { service: null, rooms: [] });
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
        // Full page load on purpose: the cleared cookie must reach the next request.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/sign-in");
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
      const result = await exitKioskAction({ password: exitPassword });
      if (result.status === "exited") {
        // A full page load on purpose: it drops every piece of client state and picks up the cleared cookie.
        window.location.assign(result.redirectTo);
        return;
      }
      setExitPassword("");
      if (result.status === "wrong_password") setExitMessage(k("exitWrong"));
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
        {screen !== "locked" ? (
          <Button
            {...smallButton}
            variant="default"
            leftSection={<LogOut size={16} />}
            onClick={() => {
              setExitMessage(null);
              setExitPassword("");
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
                  onChange={(e) => setInput(e.currentTarget.value)}
                  data-autofocus
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
                  onChange={(e) => setInput(e.currentTarget.value.toUpperCase())}
                  data-autofocus
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
                const status = child.needsGreeter
                  ? k("childGreeter")
                  : child.alreadyCheckedIn
                    ? k("childAlreadyIn")
                    : isSelected
                      ? k("childSelected")
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
                      {roomId === room.id ? ` (${k("roomSelected")})` : ""}
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
                      aria-label={`${k("pinFor", { name: result.displayName })}: ${result.pin.split("").join(" ")}`}
                      style={{ fontSize: 72, letterSpacing: "0.15em", lineHeight: 1.1 }}
                    >
                      {result.pin}
                    </Text>
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
        role="alertdialog"
      >
        <Stack gap="lg">
          <Text role="status" aria-live="assertive" size="lg">
            {k("idleWarningBody", { seconds: idle.secondsLeft })}
          </Text>
          <Button {...bigButton} onClick={idle.stayActive}>
            {k("idleStay")}
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={exitOpen}
        onClose={() => setExitOpen(false)}
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
            <PasswordInput
              size="lg"
              label={k("exitPasswordLabel")}
              value={exitPassword}
              autoComplete="off"
              visibilityToggleButtonProps={{ style: { width: 44, height: 44 } }}
              onChange={(e) => setExitPassword(e.currentTarget.value)}
              data-autofocus
            />
            {exitMessage ? (
              <Alert role="alert" color="red" icon={<AlertTriangle size={20} />} radius="lg">
                <Text fw={600}>{exitMessage}</Text>
              </Alert>
            ) : null}
            <Button type="submit" {...bigButton} loading={exitBusy} disabled={!exitPassword}>
              {k("exitConfirm")}
            </Button>
            <Button {...smallButton} variant="default" onClick={() => setExitOpen(false)}>
              {k("exitCancel")}
            </Button>
          </Stack>
        </form>
      </Modal>
    </Box>
  );
}
