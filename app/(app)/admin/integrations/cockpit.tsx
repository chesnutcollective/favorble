"use client";

import { useEffect, useState } from "react";
import type { IntegrationsStatus, ServiceHealth } from "@/lib/services/integrations-status";

const COCKPIT_CSS = `
.cockpit-root{
  --cp-bg:#FAFAF8;--cp-surface:#F8F9FC;
  --cp-t1:#18181a;--cp-t2:#52525e;--cp-t3:#8b8b97;--cp-t4:#c4c4ce;--cp-tl:#6e6e80;
  --cp-bs:rgba(59,89,152,0.08);--cp-bd:rgba(59,89,152,0.13);--cp-bs2:rgba(59,89,152,0.20);
  --cp-ac:#3b5998;--cp-ach:#2d4a85;--cp-acs:rgba(59,89,152,0.08);
  --cp-gr:#2b8a3e;--cp-grs:rgba(43,138,62,0.10);
  --cp-am:#cf8a00;--cp-ams:rgba(207,138,0,0.10);
  --cp-rd:#d1453b;--cp-rds:rgba(209,69,59,0.10);
  --cp-sc:inset 0 1px 0 rgba(255,255,255,0.85), 0 1px 3px rgba(59,89,152,0.06);
  --cp-sch:inset 0 1px 0 rgba(255,255,255,0.9), 0 4px 14px rgba(59,89,152,0.10);
  --cp-mono:'DM Mono','SF Mono',Menlo,monospace;
  font-family:'DM Sans',-apple-system,system-ui,sans-serif;
  background:var(--cp-bg);
  background-image:
    linear-gradient(rgba(59,89,152,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(59,89,152,0.025) 1px, transparent 1px);
  background-size:28px 28px;
  color:var(--cp-t1);font-size:13px;line-height:1.48;
  -webkit-font-smoothing:antialiased;
  min-height:100vh;
  padding:20px 24px 40px;
}
.cockpit-root *,.cockpit-root *::before,.cockpit-root *::after{box-sizing:border-box;margin:0;padding:0}

@keyframes cp-pulse-ring{0%{transform:scale(0.8);opacity:0.9}100%{transform:scale(2.2);opacity:0}}
@keyframes cp-fade-up{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes cp-blink{50%{opacity:0.35}}

.cp-app{max-width:1480px;margin:0 auto}

/* TOP BAR */
.cp-topbar{display:flex;align-items:center;gap:16px;padding:14px 18px;background:var(--cp-surface);border:1px solid var(--cp-bd);border-radius:10px;box-shadow:var(--cp-sc);margin-bottom:12px}
.cp-brand{display:flex;flex-direction:column;gap:2px;min-width:0}
.cp-eyebrow{font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:var(--cp-t3);display:flex;align-items:center;gap:8px}
.cp-eyebrow::before{content:'';width:5px;height:5px;background:var(--cp-ac);border-radius:50%;display:inline-block}
.cp-title{font-size:21px;font-weight:600;letter-spacing:-0.035em;color:var(--cp-t1);line-height:1.1}
.cp-spacer{flex:1}
.cp-meta{display:flex;align-items:center;gap:18px;font-size:12px;color:var(--cp-t2);font-family:var(--cp-mono)}
.cp-meta-item{display:flex;align-items:center;gap:7px}
.cp-meta-label{font-size:9.5px;text-transform:uppercase;letter-spacing:0.08em;color:var(--cp-t3);font-family:'DM Sans',sans-serif;font-weight:600}
.cp-live{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;background:var(--cp-grs);border:1px solid rgba(43,138,62,0.25);border-radius:20px;font-size:10.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--cp-gr)}
.cp-live-dot{position:relative;width:7px;height:7px;background:var(--cp-gr);border-radius:50%;color:var(--cp-gr)}
.cp-live-dot::after{content:'';position:absolute;inset:0;border-radius:50%;background:currentColor;animation:cp-pulse-ring 1.8s ease-out infinite}
.cp-refresh{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:#fff;border:1px solid var(--cp-bd);border-radius:7px;font-size:12px;color:var(--cp-t2);cursor:pointer;font-family:inherit;transition:all 150ms}
.cp-refresh:hover{border-color:var(--cp-bs2);color:var(--cp-t1);box-shadow:var(--cp-sc)}
.cp-vr{width:1px;height:20px;background:var(--cp-bd)}

/* ALERT */
.cp-alert{display:flex;align-items:center;gap:14px;padding:12px 16px;background:linear-gradient(180deg, rgba(209,69,59,0.05) 0%, rgba(209,69,59,0.08) 100%);border:1px solid rgba(209,69,59,0.28);border-left:3px solid var(--cp-rd);border-radius:10px;box-shadow:var(--cp-sc);margin-bottom:12px;animation:cp-fade-up 300ms ease both}
.cp-alert-icon{width:28px;height:28px;flex-shrink:0;background:var(--cp-rd);color:#fff;border-radius:7px;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;box-shadow:0 0 0 3px rgba(209,69,59,0.18)}
.cp-alert-body{flex:1;min-width:0}
.cp-alert-title{font-size:13px;font-weight:600;color:#8a2a22;letter-spacing:-0.01em}
.cp-alert-desc{font-size:12px;color:#8a2a22;opacity:0.82;margin-top:2px;font-family:var(--cp-mono)}
.cp-alert-actions{display:flex;gap:8px}
.cp-btn-danger{padding:6px 12px;background:var(--cp-rd);color:#fff;border:none;border-radius:6px;font-size:11.5px;font-weight:500;cursor:pointer;font-family:inherit}
.cp-btn-danger:hover{background:#b83a31}
.cp-btn-ghost{padding:6px 12px;background:#fff;border:1px solid rgba(209,69,59,0.3);color:#8a2a22;border-radius:6px;font-size:11.5px;font-weight:500;cursor:pointer;font-family:inherit}
.cp-btn-ghost:hover{background:rgba(209,69,59,0.04)}

/* COUNTERS */
.cp-counters{display:grid;grid-template-columns:repeat(8, 1fr);gap:1px;background:var(--cp-bd);border:1px solid var(--cp-bd);border-radius:10px;box-shadow:var(--cp-sc);margin-bottom:14px;overflow:hidden}
.cp-counter{background:var(--cp-surface);padding:12px 14px;display:flex;flex-direction:column;gap:4px;transition:background 150ms}
.cp-counter:hover{background:#fff}
.cp-counter-label{font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--cp-t3)}
.cp-counter-val{font-size:19px;font-weight:600;letter-spacing:-0.035em;color:var(--cp-t1);font-variant-numeric:tabular-nums;line-height:1;display:flex;align-items:baseline;gap:5px}
.cp-counter-delta{font-size:10px;font-weight:500;font-family:var(--cp-mono)}
.cp-counter-delta.up{color:var(--cp-gr)}
.cp-counter-delta.down{color:var(--cp-rd)}
.cp-counter-delta.neutral{color:var(--cp-t3)}
.cp-counter.warn .cp-counter-val{color:var(--cp-am)}
.cp-counter.bad .cp-counter-val{color:var(--cp-rd)}
.cp-counter-unit{font-size:13px;color:var(--cp-t3);font-weight:500}

/* MAIN GRID */
.cp-main{display:grid;grid-template-columns:1.55fr 1fr;gap:12px;margin-bottom:12px}

/* CARD */
.cp-card{background:var(--cp-surface);border:1px solid var(--cp-bd);border-radius:10px;box-shadow:var(--cp-sc);overflow:hidden}
.cp-card-header{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--cp-bs);background:linear-gradient(180deg,rgba(255,255,255,0.5),transparent)}
.cp-card-title{font-size:10.5px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;color:var(--cp-tl)}
.cp-card-meta{font-size:11px;color:var(--cp-t3);font-family:var(--cp-mono)}
.cp-card-spacer{flex:1}
.cp-tag{font-size:9.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:2px 7px;border-radius:4px}
.cp-tag.green{background:var(--cp-grs);color:var(--cp-gr)}
.cp-tag.amber{background:var(--cp-ams);color:var(--cp-am)}
.cp-tag.red{background:var(--cp-rds);color:var(--cp-rd)}
.cp-tag.neutral{background:var(--cp-acs);color:var(--cp-ac)}

/* SERVICES */
.cp-services-body{padding:12px}
.cp-services-grid{display:grid;grid-template-columns:repeat(2, 1fr);gap:8px}
.cp-svc{background:#fff;border:1px solid var(--cp-bs);border-radius:8px;padding:11px 12px;display:flex;flex-direction:column;gap:8px;transition:all 150ms;position:relative;overflow:hidden}
.cp-svc:hover{border-color:var(--cp-bs2);box-shadow:var(--cp-sch);transform:translateY(-1px)}
.cp-svc::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--cp-t4)}
.cp-svc.ok::before{background:var(--cp-gr)}
.cp-svc.warn::before{background:var(--cp-am)}
.cp-svc.bad::before{background:var(--cp-rd)}
.cp-svc-head{display:flex;align-items:center;gap:9px}
.cp-dot{position:relative;width:8px;height:8px;border-radius:50%;flex-shrink:0}
.cp-dot.ok{background:var(--cp-gr);color:var(--cp-gr);box-shadow:0 0 0 2px rgba(43,138,62,0.18)}
.cp-dot.warn{background:var(--cp-am);color:var(--cp-am);box-shadow:0 0 0 2px rgba(207,138,0,0.18)}
.cp-dot.bad{background:var(--cp-rd);color:var(--cp-rd);box-shadow:0 0 0 2px rgba(209,69,59,0.18)}
.cp-dot.off{background:var(--cp-t4);box-shadow:0 0 0 2px rgba(196,196,206,0.3)}
.cp-dot.ok::after,.cp-dot.warn::after,.cp-dot.bad::after{content:'';position:absolute;inset:0;border-radius:50%;background:currentColor;animation:cp-pulse-ring 2s ease-out infinite}
.cp-svc-name{font-size:12.5px;font-weight:600;letter-spacing:-0.01em;color:var(--cp-t1);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-svc-env{font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:1.5px 5px;border-radius:3px;background:var(--cp-acs);color:var(--cp-ac);font-family:var(--cp-mono)}
.cp-svc-meta{display:flex;gap:14px;font-size:10.5px;color:var(--cp-t3);font-family:var(--cp-mono);flex-wrap:wrap}
.cp-svc-meta-item{display:flex;align-items:center;gap:4px}
.cp-svc-meta-label{color:var(--cp-t4);font-size:9px;text-transform:uppercase;letter-spacing:0.05em}
.cp-svc-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:8px;border-top:1px dashed var(--cp-bs)}
.cp-svc-health{font-size:10.5px;color:var(--cp-t2);font-family:var(--cp-mono)}
.cp-svc-health.bad{color:var(--cp-rd);font-weight:500}
.cp-svc-health.warn{color:var(--cp-am);font-weight:500}
.cp-svc-run{font-size:10.5px;font-weight:500;padding:4px 9px;background:#fff;border:1px solid var(--cp-bd);border-radius:5px;color:var(--cp-t2);cursor:pointer;font-family:inherit;transition:all 120ms;display:inline-flex;align-items:center;gap:4px;text-decoration:none}
.cp-svc-run:hover{border-color:var(--cp-ac);color:var(--cp-ac);background:var(--cp-acs)}
.cp-svc-run.danger{color:var(--cp-rd);border-color:rgba(209,69,59,0.3)}
.cp-svc-run.danger:hover{background:var(--cp-rds);border-color:var(--cp-rd)}

/* FEED */
.cp-feed-body{padding:4px 0;max-height:720px;overflow-y:auto}
.cp-feed-item{display:flex;gap:10px;padding:9px 16px 9px 14px;border-left:2px solid transparent;transition:background 120ms;position:relative}
.cp-feed-item:hover{background:rgba(59,89,152,0.025)}
.cp-feed-item+.cp-feed-item{border-top:1px solid var(--cp-bs)}
.cp-feed-item.ok{border-left-color:var(--cp-gr)}
.cp-feed-item.bad{border-left-color:var(--cp-rd);background:rgba(209,69,59,0.02)}
.cp-feed-item.warn{border-left-color:var(--cp-am)}
.cp-feed-item.info{border-left-color:var(--cp-ac)}
.cp-feed-time{font-family:var(--cp-mono);font-size:10.5px;color:var(--cp-t3);flex-shrink:0;padding-top:2px;min-width:40px}
.cp-feed-icon{width:18px;height:18px;flex-shrink:0;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;margin-top:1px}
.cp-feed-icon.ok{background:var(--cp-grs);color:var(--cp-gr)}
.cp-feed-icon.bad{background:var(--cp-rds);color:var(--cp-rd)}
.cp-feed-icon.warn{background:var(--cp-ams);color:var(--cp-am)}
.cp-feed-icon.info{background:var(--cp-acs);color:var(--cp-ac)}
.cp-feed-content{flex:1;min-width:0}
.cp-feed-line{font-size:12px;color:var(--cp-t1);line-height:1.4}
.cp-feed-line strong{font-weight:600}
.cp-feed-line code{font-family:var(--cp-mono);font-size:11px;background:var(--cp-acs);color:var(--cp-ac);padding:1px 5px;border-radius:3px}
.cp-feed-sub{font-size:10.5px;color:var(--cp-t3);margin-top:2px;font-family:var(--cp-mono)}
.cp-feed-sub.bad{color:var(--cp-rd)}

/* BOTTOM */
.cp-bottom{display:grid;grid-template-columns:1.4fr 1fr;gap:12px}
.cp-wf-body{padding:10px 16px 14px}
.cp-wf-summary{display:flex;align-items:center;gap:14px;padding-bottom:11px;margin-bottom:10px;border-bottom:1px solid var(--cp-bs)}
.cp-wf-big{font-size:26px;font-weight:600;letter-spacing:-0.04em;line-height:1;color:var(--cp-am);font-variant-numeric:tabular-nums}
.cp-wf-big .sub{font-size:14px;color:var(--cp-t3);font-weight:500}
.cp-wf-st{flex:1}
.cp-wf-st-title{font-size:12.5px;font-weight:600;color:var(--cp-t1)}
.cp-wf-st-desc{font-size:11px;color:var(--cp-t3);margin-top:2px;font-family:var(--cp-mono)}
.cp-wf-enable{font-size:11px;padding:6px 12px;background:var(--cp-ac);color:#fff;border:none;border-radius:6px;font-weight:500;cursor:pointer;font-family:inherit}
.cp-wf-enable:hover{background:var(--cp-ach)}
.cp-wf-list{display:flex;flex-direction:column;gap:1px;background:var(--cp-bs);border:1px solid var(--cp-bs);border-radius:7px;overflow:hidden}
.cp-wf-item{display:flex;align-items:center;gap:10px;padding:8px 11px;background:#fff;font-size:11.5px}
.cp-wf-item:hover{background:rgba(59,89,152,0.02)}
.cp-wf-name{flex:1;color:var(--cp-t1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-wf-trig{font-size:10px;color:var(--cp-t3);font-family:var(--cp-mono);padding:1.5px 6px;background:var(--cp-acs);border-radius:3px}
.cp-wf-last{font-size:10px;color:var(--cp-t3);font-family:var(--cp-mono)}
.cp-toggle{position:relative;width:26px;height:14px;background:var(--cp-t4);border-radius:8px;cursor:pointer;transition:background 150ms;flex-shrink:0}
.cp-toggle::after{content:'';position:absolute;top:2px;left:2px;width:10px;height:10px;background:#fff;border-radius:50%;transition:left 150ms;box-shadow:0 1px 2px rgba(0,0,0,0.2)}
.cp-toggle.on{background:var(--cp-gr)}
.cp-toggle.on::after{left:14px}

/* QUEUES */
.cp-q-body{padding:12px 16px 14px;display:flex;flex-direction:column;gap:10px}
.cp-q-item{padding:10px 12px;background:#fff;border:1px solid var(--cp-bs);border-radius:7px}
.cp-q-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.cp-q-name{font-size:12px;font-weight:600;color:var(--cp-t1);flex:1}
.cp-q-count{font-size:10.5px;color:var(--cp-t3);font-family:var(--cp-mono)}
.cp-q-bar{height:5px;background:var(--cp-acs);border-radius:3px;overflow:hidden;display:flex;gap:1px}
.cp-q-seg{height:100%}
.cp-q-seg.running{background:var(--cp-gr);animation:cp-blink 1.6s ease-in-out infinite}
.cp-q-seg.pending{background:var(--cp-am)}
.cp-q-seg.failed{background:var(--cp-rd)}
.cp-q-stats{display:flex;gap:12px;margin-top:7px;font-size:10.5px;color:var(--cp-t3);font-family:var(--cp-mono);flex-wrap:wrap}
.cp-q-stats .running{color:var(--cp-gr);font-weight:500}
.cp-q-stats .pending{color:var(--cp-am);font-weight:500}
.cp-q-stats .failed{color:var(--cp-rd);font-weight:500}

/* FOOTER */
.cp-footer{display:flex;align-items:center;gap:16px;padding:10px 16px;background:var(--cp-surface);border:1px solid var(--cp-bd);border-radius:10px;box-shadow:var(--cp-sc);margin-top:12px;font-size:11px;color:var(--cp-t3);font-family:var(--cp-mono);flex-wrap:wrap}
.cp-footer .spacer{flex:1}
.cp-footer-item{display:inline-flex;align-items:center;gap:6px}
.cp-footer-dot{width:5px;height:5px;border-radius:50%;background:var(--cp-gr);animation:cp-pulse-ring 2s ease-out infinite;color:var(--cp-gr)}
`;

function StatusDot({ status }: { status: ServiceHealth["status"] }) {
	return <span className={`cp-dot ${status}`} />;
}

function ServiceCard({ svc }: { svc: ServiceHealth }) {
	return (
		<div className={`cp-svc ${svc.status}`}>
			<div className="cp-svc-head">
				<StatusDot status={svc.status} />
				<span className="cp-svc-name">{svc.name}</span>
				<span className="cp-svc-env">{svc.env}</span>
			</div>
			<div className="cp-svc-meta">
				{svc.meta.map((m) => (
					<span key={m.label} className="cp-svc-meta-item">
						<span className="cp-svc-meta-label">{m.label}</span> {m.value}
					</span>
				))}
			</div>
			<div className="cp-svc-footer">
				<span className={`cp-svc-health ${svc.healthClass ?? ""}`}>
					{svc.health}
				</span>
				{svc.action &&
					(svc.url ? (
						<a
							href={svc.url}
							className={`cp-svc-run ${svc.action.variant === "danger" ? "danger" : ""}`}
						>
							{svc.action.label}
						</a>
					) : (
						<button
							type="button"
							className={`cp-svc-run ${svc.action.variant === "danger" ? "danger" : ""}`}
						>
							{svc.action.label}
						</button>
					))}
			</div>
		</div>
	);
}

export function IntegrationsCockpit({ status }: { status: IntegrationsStatus }) {
	const [clock, setClock] = useState(status.nowUtc);
	const [since, setSince] = useState(2);

	useEffect(() => {
		const tick = () => {
			const d = new Date();
			const pad = (n: number) => String(n).padStart(2, "0");
			setClock(
				`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
			);
			setSince((s) => (s + 1) % 60);
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, []);

	const okCount = status.services.filter((s) => s.status === "ok").length;
	const warnCount = status.services.filter((s) => s.status === "warn").length;
	const badCount = status.services.filter((s) => s.status === "bad").length;
	const offCount = status.services.filter((s) => s.status === "off").length;

	return (
		<>
			<style dangerouslySetInnerHTML={{ __html: COCKPIT_CSS }} />
			<div className="cockpit-root">
				<div className="cp-app">
					{/* TOPBAR */}
					<div className="cp-topbar">
						<div className="cp-brand">
							<div className="cp-eyebrow">
								Favorble · Admin · Operations Cockpit
							</div>
							<div className="cp-title">Integrations &amp; Systems</div>
						</div>
						<div className="cp-spacer" />
						<div className="cp-meta">
							<div className="cp-meta-item">
								<span className="cp-meta-label">ENV</span>
								<span>staging</span>
							</div>
							<div className="cp-vr" />
							<div className="cp-meta-item">
								<span className="cp-meta-label">REGION</span>
								<span>us-east4</span>
							</div>
							<div className="cp-vr" />
							<div className="cp-meta-item">
								<span className="cp-meta-label">UTC</span>
								<span>{clock}</span>
							</div>
						</div>
						<div className="cp-live">
							<span className="cp-live-dot" />
							Live
						</div>
						<button
							type="button"
							className="cp-refresh"
							onClick={() => window.location.reload()}
						>
							<svg
								viewBox="0 0 16 16"
								width={12}
								height={12}
								fill="none"
								stroke="currentColor"
								strokeWidth={1.5}
								aria-hidden="true"
							>
								<path d="M13.5 8A5.5 5.5 0 1 1 12.5 4.5" />
								<path d="M13 2v3h-3" />
							</svg>
							Refresh
						</button>
					</div>

					{/* ALERTS */}
					{status.alerts.map((alert, i) => (
						<div key={i} className="cp-alert">
							<div className="cp-alert-icon">!</div>
							<div className="cp-alert-body">
								<div className="cp-alert-title">{alert.title}</div>
								<div className="cp-alert-desc">{alert.desc}</div>
							</div>
							<div className="cp-alert-actions">
								<button type="button" className="cp-btn-ghost">
									View logs
								</button>
								<button type="button" className="cp-btn-danger">
									Restart service
								</button>
							</div>
						</div>
					))}

					{/* COUNTERS */}
					<div className="cp-counters">
						<div className="cp-counter">
							<div className="cp-counter-label">Cases</div>
							<div className="cp-counter-val">
								{status.counts.cases.toLocaleString()}
							</div>
						</div>
						<div className="cp-counter">
							<div className="cp-counter-label">Contacts</div>
							<div className="cp-counter-val">
								{status.counts.contacts.toLocaleString()}
							</div>
						</div>
						<div className={`cp-counter ${status.counts.ereJobs === 0 ? "warn" : ""}`}>
							<div className="cp-counter-label">ERE Jobs</div>
							<div className="cp-counter-val">
								{status.counts.ereJobs}
								{status.counts.ereJobsFailed > 0 && (
									<span className="cp-counter-delta down">
										{status.counts.ereJobsFailed} fail
									</span>
								)}
							</div>
						</div>
						<div className="cp-counter">
							<div className="cp-counter-label">AI Extractions</div>
							<div className="cp-counter-val">
								{status.counts.processingResults}
							</div>
						</div>
						<div
							className={`cp-counter ${status.n8n.active === 0 ? "warn" : ""}`}
						>
							<div className="cp-counter-label">Workflows up</div>
							<div className="cp-counter-val">
								{status.n8n.active}
								<span className="cp-counter-unit">/{status.n8n.total}</span>
							</div>
						</div>
						<div className="cp-counter">
							<div className="cp-counter-label">Chronology</div>
							<div className="cp-counter-val">{status.counts.chronology}</div>
						</div>
						<div className="cp-counter">
							<div className="cp-counter-label">Documents</div>
							<div className="cp-counter-val">{status.counts.documents}</div>
						</div>
						<div className="cp-counter">
							<div className="cp-counter-label">Tasks</div>
							<div className="cp-counter-val">{status.counts.tasks}</div>
						</div>
					</div>

					{/* MAIN GRID */}
					<div className="cp-main">
						<section className="cp-card">
							<div className="cp-card-header">
								<span className="cp-card-title">Service Health</span>
								<span className="cp-card-meta">
									· {status.services.length} services monitored
								</span>
								<div className="cp-card-spacer" />
								<span className="cp-tag green">{okCount} OK</span>
								{warnCount > 0 && (
									<span className="cp-tag amber">{warnCount} WARN</span>
								)}
								{badCount > 0 && (
									<span className="cp-tag red">{badCount} DOWN</span>
								)}
								{offCount > 0 && (
									<span className="cp-tag neutral">{offCount} OFF</span>
								)}
							</div>
							<div className="cp-services-body">
								<div className="cp-services-grid">
									{status.services.map((svc) => (
										<ServiceCard key={svc.name} svc={svc} />
									))}
								</div>
							</div>
						</section>

						<section className="cp-card">
							<div className="cp-card-header">
								<span className="cp-card-title">Recent Activity</span>
								<span className="cp-card-meta">· last events</span>
								<div className="cp-card-spacer" />
								<span className="cp-live">
									<span className="cp-live-dot" />
									Streaming
								</span>
							</div>
							<div className="cp-feed-body">
								{status.activity.length === 0 && (
									<div className="cp-feed-item info">
										<span className="cp-feed-time">—</span>
										<span className="cp-feed-icon info">··</span>
										<div className="cp-feed-content">
											<div className="cp-feed-line">No recent activity</div>
											<div className="cp-feed-sub">
												Events will appear here once jobs run
											</div>
										</div>
									</div>
								)}
								{status.activity.map((item) => {
									const ts = new Date(item.timestamp);
									const now = Date.now();
									const diffMs = now - ts.getTime();
									let timeLabel: string;
									if (diffMs < 60_000) timeLabel = "now";
									else if (diffMs < 3_600_000)
										timeLabel = `${Math.floor(diffMs / 60_000)}m`;
									else if (diffMs < 86_400_000)
										timeLabel = `${Math.floor(diffMs / 3_600_000)}h`;
									else timeLabel = `${Math.floor(diffMs / 86_400_000)}d`;
									return (
										<div key={item.id} className={`cp-feed-item ${item.status}`}>
											<span className="cp-feed-time">{timeLabel}</span>
											<span className={`cp-feed-icon ${item.status}`}>
												{item.iconLabel}
											</span>
											<div className="cp-feed-content">
												<div className="cp-feed-line">{item.message}</div>
												{item.detail && (
													<div
														className={`cp-feed-sub ${item.status === "bad" ? "bad" : ""}`}
													>
														{item.detail}
													</div>
												)}
											</div>
										</div>
									);
								})}
							</div>
						</section>
					</div>

					{/* BOTTOM */}
					<div className="cp-bottom">
						<section className="cp-card">
							<div className="cp-card-header">
								<span className="cp-card-title">n8n Workflows</span>
								<span className="cp-card-meta">
									· {status.n8n.total} total
								</span>
								<div className="cp-card-spacer" />
								<span
									className={`cp-tag ${status.n8n.active === 0 ? "amber" : "green"}`}
								>
									{status.n8n.active} active
								</span>
								{status.n8n.placeholders > 0 && (
									<span className="cp-tag neutral">
										{status.n8n.placeholders} TODO
									</span>
								)}
							</div>
							<div className="cp-wf-body">
								<div className="cp-wf-summary">
									<div className="cp-wf-big">
										{status.n8n.active}
										<span className="sub">/{status.n8n.total}</span>
									</div>
									<div className="cp-wf-st">
										<div className="cp-wf-st-title">
											{!status.n8n.reachable
												? "n8n unreachable"
												: status.n8n.active === 0
													? "No workflows enabled"
													: `${status.n8n.active} workflow(s) running`}
										</div>
										<div className="cp-wf-st-desc">
											{status.n8n.total - status.n8n.placeholders} scaffolded +{" "}
											{status.n8n.placeholders} placeholder
										</div>
									</div>
									<a
										href="https://n8n-staging-b24a.up.railway.app/"
										target="_blank"
										rel="noreferrer"
										className="cp-wf-enable"
									>
										Open n8n
									</a>
								</div>
								<div className="cp-wf-list">
									{status.n8n.workflows.length === 0 && (
										<div className="cp-wf-item">
											<span className="cp-wf-name">
												No workflows returned by n8n API
											</span>
										</div>
									)}
									{status.n8n.workflows.slice(0, 9).map((wf) => {
										let lastLabel = "never";
										if (wf.lastExecution) {
											const diff = Date.now() - new Date(wf.lastExecution).getTime();
											if (diff < 3_600_000)
												lastLabel = `${Math.floor(diff / 60_000)}m ago`;
											else if (diff < 86_400_000)
												lastLabel = `${Math.floor(diff / 3_600_000)}h ago`;
											else lastLabel = `${Math.floor(diff / 86_400_000)}d ago`;
										}
										return (
											<div key={wf.id} className="cp-wf-item">
												<div className={`cp-toggle ${wf.active ? "on" : ""}`} />
												<span className="cp-wf-name">{wf.name}</span>
												<span className="cp-wf-trig">{wf.trigger}</span>
												<span className="cp-wf-last">{lastLabel}</span>
											</div>
										);
									})}
									{status.n8n.workflows.length > 9 && (
										<div className="cp-wf-item" style={{ opacity: 0.7 }}>
											<div className="cp-toggle" />
											<span className="cp-wf-name">
												+ {status.n8n.workflows.length - 9} more workflows
											</span>
											<span className="cp-wf-trig">mixed</span>
											<span className="cp-wf-last">—</span>
										</div>
									)}
								</div>
							</div>
						</section>

						<section className="cp-card">
							<div className="cp-card-header">
								<span className="cp-card-title">Queue Depths</span>
								<span className="cp-card-meta">· BullMQ · Redis</span>
								<div className="cp-card-spacer" />
								<span className="cp-live">
									<span className="cp-live-dot" />
									Live
								</span>
							</div>
							<div className="cp-q-body">
								<div className="cp-q-item">
									<div className="cp-q-head">
										<span className="cp-q-name">langextract</span>
										<span className="cp-q-count">0 jobs</span>
									</div>
									<div className="cp-q-bar">
										<div className="cp-q-seg" style={{ width: "0%" }} />
									</div>
									<div className="cp-q-stats">
										<span>
											· {status.counts.processingResults} completed ·{" "}
											{status.counts.chronology} chronology
										</span>
									</div>
								</div>
								<div className="cp-q-item">
									<div className="cp-q-head">
										<span className="cp-q-name">doc-processing</span>
										<span className="cp-q-count">0 jobs</span>
									</div>
									<div className="cp-q-bar">
										<div className="cp-q-seg" style={{ width: "0%" }} />
									</div>
									<div className="cp-q-stats">
										<span>idle · waiting for ERE credentials</span>
									</div>
								</div>
								<div className="cp-q-item">
									<div className="cp-q-head">
										<span className="cp-q-name">ere-fetch</span>
										<span className="cp-q-count">{status.counts.ereJobs} jobs</span>
									</div>
									<div className="cp-q-bar">
										{status.counts.ereJobsFailed > 0 && (
											<div
												className="cp-q-seg failed"
												style={{ width: "100%" }}
											/>
										)}
									</div>
									<div className="cp-q-stats">
										{status.counts.ereJobs === 0 ? (
											<span>blocked by ere-cron · 0 credentials stored</span>
										) : (
											<>
												<span className="failed">
													{status.counts.ereJobsFailed} failed
												</span>
												<span>· {status.counts.ereJobs} total</span>
											</>
										)}
									</div>
								</div>
								<div className="cp-q-item">
									<div className="cp-q-head">
										<span className="cp-q-name">email-ingest</span>
										<span className="cp-q-count">0 jobs</span>
									</div>
									<div className="cp-q-bar">
										<div className="cp-q-seg" style={{ width: "0%" }} />
									</div>
									<div className="cp-q-stats">
										<span>idle · Outlook not linked</span>
									</div>
								</div>
							</div>
						</section>
					</div>

					{/* FOOTER */}
					<div className="cp-footer">
						<span className="cp-footer-item">
							<span className="cp-footer-dot" />
							Auto-refresh manual · click Refresh to update
						</span>
						<span>
							Last updated: <span>{since}s</span> ago
						</span>
						<div className="spacer" />
						<span>
							DB: {status.counts.cases} cases · {status.counts.contacts}{" "}
							contacts · {status.counts.tasks} tasks ·{" "}
							{status.counts.documents} documents · {status.counts.users} users
							· {status.counts.chronology} chronology ·{" "}
							{status.counts.processingResults} processing results
						</span>
					</div>
				</div>
			</div>
		</>
	);
}
