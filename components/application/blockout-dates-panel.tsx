"use client";

import { ActionIcon, Button, Group, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { CalendarX, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  addBlockoutDatesByTokenAction,
  addMyBlockoutDatesAction,
  addVolunteerBlockoutDatesAction,
  listVolunteerBlockoutDatesAction,
  removeBlockoutDatesByTokenAction,
  removeMyBlockoutDatesAction,
  removeVolunteerBlockoutDatesAction,
  type BlockoutChangeResult,
  type ScheduledShiftDay,
} from "@/app/app/volunteer-actions";
import { useI18n } from "@/components/i18n-provider";
import {
  groupBlockoutRanges,
  type BlockoutDate,
  type BlockoutErrorCode,
  type BlockoutRange,
} from "@/lib/blockout-dates";

/**
 * Who the dates belong to, and so which actions apply:
 *  - "self": the signed-in person (member schedule page);
 *  - "token": a volunteer using their volunteer link (the schedule page
 *    linked from the emailed confirm link);
 *  - "admin": a service-plan admin managing a volunteer (directory).
 */
export type BlockoutTarget =
  | { kind: "self" }
  | { kind: "token"; token: string }
  | { kind: "admin"; profileId: string; fullName: string };

const ERROR_KEYS: Record<BlockoutErrorCode | "load_failed", string> = {
  invalid_date: "errInvalidDate",
  end_before_start: "errEndBeforeStart",
  past: "errPast",
  too_far: "errTooFar",
  range_too_long: "errRangeTooLong",
  link_expired: "errLinkExpired",
  not_found: "errNotFound",
  no_profile: "errNoProfile",
  save_failed: "errSave",
  load_failed: "errLoad",
};

type Range = { from: string; to: string | null };

function add(target: BlockoutTarget, input: Range & { reason: string | null }) {
  if (target.kind === "self") return addMyBlockoutDatesAction(input);
  if (target.kind === "token") return addBlockoutDatesByTokenAction({ token: target.token, ...input });
  return addVolunteerBlockoutDatesAction({ profileId: target.profileId, ...input });
}

function remove(target: BlockoutTarget, range: Range) {
  if (target.kind === "self") return removeMyBlockoutDatesAction(range);
  if (target.kind === "token") return removeBlockoutDatesByTokenAction({ token: target.token, ...range });
  return removeVolunteerBlockoutDatesAction({ profileId: target.profileId, ...range });
}

export function BlockoutDatesPanel({
  target,
  initialDates,
  initialError = null,
  withTitle = true,
}: {
  target: BlockoutTarget;
  /** Null means "load them" (the admin view opens without them). */
  initialDates: BlockoutDate[] | null;
  /** Set when the page couldn't load the dates, so the panel says so instead of the page failing. */
  initialError?: "load_failed" | null;
  withTitle?: boolean;
}) {
  const { locale, t } = useI18n();
  const tr = (key: string, values?: Record<string, string | number>) => t("blockoutDates", key, values);
  const intlLocale = locale === "en" ? "en-US" : locale === "es-PR" ? "es-PR" : "es-US";
  const formatDay = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(intlLocale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  const describeRange = (range: BlockoutRange) =>
    range.days === 1 ? formatDay(range.from) : `${formatDay(range.from)} – ${formatDay(range.to)}`;

  const [dates, setDates] = useState<BlockoutDate[] | null>(initialDates);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [errorCode, setErrorCode] = useState<BlockoutErrorCode | "load_failed" | null>(initialError);
  const [status, setStatus] = useState<{ saved: boolean; scheduledOn: ScheduledShiftDay[] }>({
    saved: false,
    scheduledOn: [],
  });
  const [isAdding, startAdding] = useTransition();
  const [removingFrom, setRemovingFrom] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fromRef = useRef<HTMLInputElement>(null);

  const adminProfileId = target.kind === "admin" ? target.profileId : null;
  useEffect(() => {
    if (!adminProfileId || initialDates !== null) return;
    let cancelled = false;
    listVolunteerBlockoutDatesAction({ profileId: adminProfileId })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setDates(res.dates);
        else setErrorCode(res.code);
      })
      .catch(() => {
        if (!cancelled) setErrorCode("load_failed");
      });
    return () => {
      cancelled = true;
    };
  }, [adminProfileId, initialDates]);

  function apply(result: BlockoutChangeResult) {
    if (!result.ok) {
      setErrorCode(result.code);
      setStatus({ saved: false, scheduledOn: [] });
      return false;
    }
    setErrorCode(null);
    setDates(result.dates);
    setStatus({ saved: true, scheduledOn: result.scheduledOn });
    return true;
  }

  function handleAdd() {
    startAdding(async () => {
      try {
        if (apply(await add(target, { from, to: to || null, reason: reason || null }))) {
          setFrom("");
          setTo("");
          setReason("");
          fromRef.current?.focus();
        }
      } catch {
        setErrorCode("save_failed");
      }
    });
  }

  async function handleRemove(range: BlockoutRange) {
    setRemovingFrom(range.from);
    try {
      // The removed row disappears, so move focus to the list rather than the page body.
      if (apply(await remove(target, { from: range.from, to: range.to }))) listRef.current?.focus();
    } catch {
      setErrorCode("save_failed");
    } finally {
      setRemovingFrom(null);
    }
  }

  const ranges = dates ? groupBlockoutRanges(dates) : null;
  const previewDays =
    from && to && to >= from ? Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1 : 1;
  const preview = from
    ? previewDays > 1
      ? tr("previewRange", { from: formatDay(from), to: formatDay(to), count: previewDays })
      : tr("previewOne", { date: formatDay(from) })
    : null;

  const who = target.kind === "admin" ? target.fullName : null;
  const scheduled = status.scheduledOn;
  const shiftList = scheduled.map((shift) => `${formatDay(shift.date)} (${shift.title})`).join(", ");
  const which = tr(scheduled.length === 1 ? "thatShift" : "thoseShifts");
  const scheduledHint =
    target.kind === "admin"
      ? tr("scheduledAdmin", { name: who ?? "", shifts: shiftList })
      : tr(target.kind === "token" ? "scheduledToken" : "scheduledSelf", { shifts: shiftList, which });

  return (
    <Paper withBorder radius="md" p="md" data-testid="blockout-dates">
      <Stack gap="sm">
        {withTitle ? (
          <Group gap="xs">
            <CalendarX size={18} aria-hidden />
            <Title order={3} size="h5">
              {who ? tr("adminTitle", { name: who }) : tr("title")}
            </Title>
          </Group>
        ) : null}
        <Text size="sm" c="dimmed">
          {who ? tr("adminIntro") : tr("intro")}
        </Text>

        {/* Always rendered, so screen readers announce changes reliably. */}
        <div role="alert" aria-live="assertive">
          {errorCode ? (
            <Text size="sm" c="red">
              {tr(ERROR_KEYS[errorCode])}
            </Text>
          ) : null}
        </div>
        <div role="status" aria-live="polite">
          {scheduled.length > 0 ? (
            <Text size="sm" c="orange.8" fw={500}>
              {scheduledHint}
            </Text>
          ) : status.saved ? (
            <Text size="sm" c="teal.8">
              {tr("saved")}
            </Text>
          ) : null}
        </div>

        <Group align="flex-end" gap="xs" wrap="wrap">
          <TextInput
            ref={fromRef}
            type="date"
            label={tr("firstDay")}
            value={from}
            onChange={(e) => setFrom(e.currentTarget.value)}
            required
            w={{ base: "100%", sm: 170 }}
          />
          <TextInput
            type="date"
            label={tr("lastDay")}
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.currentTarget.value)}
            w={{ base: "100%", sm: 230 }}
          />
          <TextInput
            label={tr("reason")}
            placeholder={tr("reasonPlaceholder")}
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.currentTarget.value)}
            w={{ base: "100%", sm: "auto" }}
            style={{ flex: 1, minWidth: 180 }}
          />
          <Button
            onClick={handleAdd}
            disabled={!from}
            loading={isAdding}
            h={44}
            w={{ base: "100%", sm: "auto" }}
            data-primary-action={target.kind === "self" ? true : undefined}
          >
            {tr("add")}
          </Button>
        </Group>
        {preview ? (
          <Text size="xs" c="dimmed" data-testid="blockout-preview">
            {preview}
          </Text>
        ) : null}

        <div ref={listRef} tabIndex={-1} style={{ outline: "none" }}>
          {ranges === null ? (
            <Text size="sm" c="dimmed">
              {tr("loading")}
            </Text>
          ) : ranges.length === 0 ? (
            <Text size="sm" c="dimmed">
              {tr("empty")}
            </Text>
          ) : (
            <Stack gap={4}>
              {ranges.map((range) => {
                const label = describeRange(range);
                return (
                  <Group key={range.from} justify="space-between" wrap="nowrap">
                    <Stack gap={0} style={{ minWidth: 0 }}>
                      <Text size="sm" fw={500}>
                        {label}
                        {range.days > 1 ? (
                          <Text span size="xs" c="dimmed">
                            {" "}
                            · {tr("days", { count: range.days })}
                          </Text>
                        ) : null}
                      </Text>
                      {range.reason ? (
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {range.reason}
                        </Text>
                      ) : null}
                    </Stack>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="xl"
                      aria-label={tr("remove", { dates: label })}
                      onClick={() => handleRemove(range)}
                      loading={removingFrom === range.from}
                      disabled={removingFrom !== null && removingFrom !== range.from}
                    >
                      <Trash2 size={18} />
                    </ActionIcon>
                  </Group>
                );
              })}
            </Stack>
          )}
        </div>
      </Stack>
    </Paper>
  );
}
