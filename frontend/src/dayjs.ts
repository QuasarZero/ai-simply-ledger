import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import "dayjs/locale/en";
import "dayjs/locale/ja";
import "dayjs/locale/zh-cn";

dayjs.extend(isoWeek);

const saved = localStorage.getItem("lang") || "zh";
dayjs.locale(saved === "zh" ? "zh-cn" : saved);

export default dayjs;
