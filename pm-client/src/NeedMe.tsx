import { useState } from "react";
import {
  ArrowUpRight,
  CheckCheck,
  GitPullRequest,
  MousePointer2,
  MessageCircle,
} from "lucide-react";
import {
  matches,
  dateLabel,
  localDate,
  type Snapshot,
  type Index,
  type Filters,
  type RequestKind,
} from "./domain";
import { Empty, TicketPath } from "./ui";
const kinds = {
  review: { title: "待验收", icon: CheckCheck },
  decision: { title: "待决策", icon: MessageCircle },
  action: { title: "待操作", icon: MousePointer2 },
};
export function NeedMe({
  snapshot,
  index,
  filters,
  onOpen,
}: {
  snapshot: Snapshot;
  index: Index;
  filters: Filters;
  onOpen: (id: string) => void;
}) {
  const [tab, setTab] = useState<RequestKind | "all">("all");
  const [today, setToday] = useState(false);
  const requests = snapshot.items.filter(
    (i) => i.request && i.status !== "closed" && matches(i, filters, index),
  );
  const shown = requests.filter(
    (i) =>
      (tab === "all" || i.request?.kind === tab) &&
      (!today ||
        (i.due &&
          localDate(i.due).toDateString() ===
            new Date(snapshot.now).toDateString())),
  );
  return (
    <div className="page need-page">
      <div className="page-intro">
        <h1>待处理事项</h1>
        <p>
          当前范围 {requests.length} 项 · 全部项目{" "}
          {
            snapshot.items.filter((i) => i.request && i.status !== "closed")
              .length
          }{" "}
          项
        </p>
      </div>
      <div className="need-tabs">
        <button
          className={tab === "all" ? "active" : ""}
          onClick={() => setTab("all")}
        >
          全部 <span>{requests.length}</span>
        </button>
        {Object.entries(kinds).map(([key, v]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key as RequestKind)}
          >
            {v.title}{" "}
            <span>
              {requests.filter((i) => i.request?.kind === key).length}
            </span>
          </button>
        ))}
        <label>
          <input
            type="checkbox"
            checked={today}
            onChange={(e) => setToday(e.target.checked)}
          />
          只看今天到期
        </label>
      </div>
      {shown.map((item) => {
        const request = item.request!;
        const { icon: Icon, title } = kinds[request.kind];
        return (
          <button
            key={item.id}
            className="request-row"
            onClick={() => onOpen(item.id)}
          >
            <span className={`request-icon ${request.kind}`}>
              <Icon size={20} />
            </span>
            <span className="request-content">
              <span className="request-top">
                <TicketPath item={item} index={index} />
                <small>{dateLabel(item.due)}</small>
              </span>
              <strong>{item.title}</strong>
              <p>{request.reason}</p>
              {request.evidence && (
                <span className="evidence">
                  <GitPullRequest size={13} />
                  {request.evidence}
                </span>
              )}
            </span>
            <span className="request-action">
              {title}
              <ArrowUpRight size={15} />
            </span>
          </button>
        );
      })}
      {!shown.length && (
        <Empty title="暂无待处理事项">当前筛选下没有匹配的请求。</Empty>
      )}
    </div>
  );
}
