import {
  careQueue,
  communicationsQueue,
  givingSummary,
  weekendChecklist,
} from "@/lib/church-admin";
import { calendarDays, type CalendarEvent } from "@/lib/calendar";

export type CareItemState = (typeof careQueue)[number] & {
  id: string;
  stage: "new" | "assigned" | "contacted";
};

export type WeekendItemState = (typeof weekendChecklist)[number] & {
  id: string;
};

export type CommunicationItemState = (typeof communicationsQueue)[number] & {
  id: string;
  status: "draft" | "ready" | "scheduled";
};

export type GivingItemState = (typeof givingSummary)[number] & {
  id: string;
  status: "normal" | "flagged" | "reconciled";
};

export type ChurchAdminWorkspaceState = {
  careItems: CareItemState[];
  weekendItems: WeekendItemState[];
  communicationsItems: CommunicationItemState[];
  givingItems: GivingItemState[];
};

export type CalendarBoardEventState = CalendarEvent & {
  id: string;
  dateLabel: string;
  theme: string;
  originalStatus: CalendarEvent["status"];
};

export type CalendarBoardState = {
  events: CalendarBoardEventState[];
};

export function buildDefaultChurchAdminWorkspaceState(): ChurchAdminWorkspaceState {
  return {
    careItems: careQueue.map((item, index) => ({
      ...item,
      id: `care-${index}`,
      stage: item.owner === "Unassigned" ? "new" : "assigned",
    })),
    weekendItems: weekendChecklist.map((item, index) => ({
      ...item,
      id: `weekend-${index}`,
    })),
    communicationsItems: communicationsQueue.map((item, index) => ({
      ...item,
      id: `comms-${index}`,
      status: index === 0 ? "ready" : index === 1 ? "draft" : "scheduled",
    })),
    givingItems: givingSummary.map((item, index) => ({
      ...item,
      id: `giving-${index}`,
      status: "normal",
    })),
  };
}

export function buildDefaultCalendarBoardState(): CalendarBoardState {
  return {
    events: calendarDays.flatMap((day) =>
      day.events.map((event, index) => ({
        ...event,
        id: `${day.dateLabel}-${index}`,
        dateLabel: day.dateLabel,
        theme: day.theme,
        originalStatus: event.status,
      })),
    ),
  };
}
