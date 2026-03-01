import type { Dayjs } from "dayjs";
import { PickersCalendarHeader } from "@mui/x-date-pickers/PickersCalendarHeader";
import type { PickersCalendarHeaderProps } from "@mui/x-date-pickers/PickersCalendarHeader";

export function YearMonthCalendarHeader(props: PickersCalendarHeaderProps<Dayjs>) {
  return <PickersCalendarHeader {...(props as any)} format="YYYY MMM" />;
}

