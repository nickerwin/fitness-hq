import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { NavBar, Section, useToast } from '../components/ui'
import { fmtDate, ymd } from '../lib/dates'
import { mergeHealthPayloads, parseHealthText } from '../lib/health'
import { createHealthToken, getConfig, syncNow, useSync } from '../lib/sync'
import { copy } from './CloudSync'

/** Read the clipboard (the Shortcut's "Copy to Clipboard" output) and log it. */
export async function pasteFromHealth(): Promise<string> {
  let text = ''
  try {
    text = await navigator.clipboard.readText()
  } catch {
    throw new Error('Allow Paste to read the Shortcut result')
  }
  const p = parseHealthText(text)
  if (!p) throw new Error('No Health data on the clipboard. Run the Shortcut first.')
  const n = await mergeHealthPayloads([p])
  return n ? 'Health data logged' : 'Already up to date'
}

export default function Health() {
  const loc = useLocation()
  const sync = useSync()
  const cfg = getConfig()
  const [toast, show] = useToast()
  const token = useLiveQuery(async () => ((await db.meta.get('health.token'))?.value as string | undefined) ?? '', [])
  const stepIssue = useLiveQuery(async () => ((await db.meta.get('health.stepIssue'))?.value as string | undefined) ?? '', [])
  const lastReceived = useLiveQuery(async () => ((await db.meta.get('health.lastReceived'))?.value as string | undefined) ?? '', [])
  const recent = useLiveQuery(() => db.measurements.orderBy('date').reverse().limit(7).toArray(), []) ?? []
  const [busy, setBusy] = useState(false)
  const handled = useRef('')
  const signedIn = sync.status !== 'off'

  // Links like #/health?date=2026-11-24&weight=184.6&steps=9120 log straight away.
  useEffect(() => {
    if (!loc.search || handled.current === loc.search) return
    handled.current = loc.search
    const p = parseHealthText(loc.search)
    if (p) mergeHealthPayloads([p]).then((n) => show(n ? 'Health data logged' : 'Already up to date'))
  }, [loc.search, show])

  const endpoint = cfg ? `${cfg.url}/rest/v1/rpc/fhq_health_ingest` : ''

  const test = async () => {
    setBusy(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { apikey: cfg!.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, date: ymd(), weight: '', steps: '' }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `HTTP ${res.status}`)
      await syncNow()
      show('Connection works')
    } catch (e) {
      show(`Test failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <NavBar title="Apple Health" back="Settings" />
      <div className="page">
        <p className="footnote" style={{ margin: '12px 4px' }}>
          Web apps can't read Apple Health directly, so an iPhone Shortcut reads your weight and steps and sends them here. Set it to run on its own each evening and you never type them again.
        </p>

        {stepIssue && (
          <div className="card footnote" style={{ fontSize: 14, margin: '0 0 12px' }}>
            <b>Steps need one setting.</b> On {fmtDate(stepIssue)} the Shortcut sent each Health sample separately instead of the day's total, so those steps weren't logged. In the Shortcut, open the Steps <b>Find Health Samples</b> action, tap <b>Show More</b> and set <b>Group By</b> to <b>Day</b>. That gives one total that matches the Health app, without counting iPhone and Apple Watch twice.
          </div>
        )}

        <Section title="Automatic (Recommended)">
          {!signedIn ? (
            <div className="card footnote" style={{ fontSize: 14 }}>
              Turn on <Link to="/sync">Cloud Sync</Link> first. The Shortcut sends data to your cloud project, and the app picks it up next time it opens, even if it was closed.
            </div>
          ) : !token ? (
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await createHealthToken()
                } catch (e) {
                  show((e as Error).message)
                } finally {
                  setBusy(false)
                }
              }}
            >
              Create Shortcut Key
            </button>
          ) : (
            <>
              <div className="card">
                <div className="footnote">You'll paste these three values into the Shortcut.</div>
                {[
                  ['URL', endpoint],
                  ['apikey', cfg!.key],
                  ['token', token],
                ].map(([l, v]) => (
                  <div key={l} style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{l}</div>
                    <div className="copy-row">
                      <span className="code">{v}</span>
                      <button className="btn small secondary" onClick={() => copy(v, show, `${l} copied`)}>
                        Copy
                      </button>
                    </div>
                  </div>
                ))}
                <button className="btn secondary" style={{ marginTop: 14 }} disabled={busy} onClick={test}>
                  Test Connection
                </button>
              </div>
              <div className="card" style={{ marginTop: 8 }}>
                <div className="card-head">Build the Shortcut (about 5 minutes)</div>
                <ol className="steps-list" style={{ marginTop: 8 }}>
                  <li>
                    Open <b>Shortcuts</b>, tap <b>+</b> and name it <b>Send to Fitness HQ</b>.
                  </li>
                  <li>
                    Add <b>Find Health Samples</b>. Type <b>Weight</b>, add a filter <b>Start Date is today</b>, sort by <b>Start Date</b>, <b>Latest First</b>, limit <b>1</b>.
                  </li>
                  <li>
                    Add another <b>Find Health Samples</b>. Type <b>Steps</b>, filter <b>Start Date is today</b>. Tap <b>Show More</b> and set <b>Group By</b> to <b>Day</b>. This is the important one: without it the Shortcut sends every separate sample, and the total won't match the Health app.
                  </li>
                  <li>
                    Add <b>Format Date</b>: Current Date, Date Format <b>Custom</b>, <code>yyyy-MM-dd</code>.
                  </li>
                  <li>
                    Add <b>Get Contents of URL</b>. Paste the <b>URL</b>. Tap the arrow: Method <b>POST</b>. Headers: add <code>apikey</code> with the key value. Request Body <b>JSON</b> with four <b>Text</b> fields:
                    <div style={{ marginTop: 6 }}>
                      <code>token</code> = your token, <code>date</code> = Formatted Date, <code>weight</code> = the Weight samples, <code>steps</code> = the Steps samples.
                    </div>
                  </li>
                  <li>
                    Run it once. It should say <b>Sent to Fitness HQ</b>. Allow access to Health when asked.
                  </li>
                  <li>
                    In <b>Automation</b>, tap <b>+</b> then <b>Time of Day</b>. Pick <b>11:45 PM</b>, <b>Daily</b>, <b>Run Immediately</b>, and choose the shortcut. If it is set to <b>Run After Confirmation</b> instead, iOS waits for a tap and the run never happens. Running it late means the evening's steps are counted too. Add a second one at <b>9:00 AM</b> if you want the morning weigh-in to show up straight away.
                  </li>
                </ol>
                <p className="footnote" style={{ marginTop: 10 }}>
                  Steps keep the highest count for the day, so running it more than once is fine. If you skip a weigh-in, the weight stays empty instead of copying yesterday's.
                </p>
              </div>
            </>
          )}
        </Section>

        <Section title="Without Cloud Sync">
          <div className="card footnote" style={{ fontSize: 14 }}>
            Build the same Shortcut, but end it with <b>Text</b> containing <code>date=</code>Formatted Date<code>&amp;weight=</code>Weight<code>&amp;steps=</code>Steps, then <b>Copy to Clipboard</b>. Run it, open Fitness HQ and tap the button below (or Paste from Health in Log Body).
          </div>
          <button
            className="btn secondary"
            style={{ marginTop: 8 }}
            onClick={async () => {
              try {
                show(await pasteFromHealth())
              } catch (e) {
                show((e as Error).message)
              }
            }}
          >
            Paste from Health
          </button>
        </Section>

        <Section title="Last 7 Days">
          {lastReceived && (
            <p className="footnote" style={{ margin: '0 4px 8px' }}>
              Last sent by the Shortcut:{' '}
              {new Date(lastReceived).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. Steps only update when it runs, so a day's count stays partial if the late run is skipped.
            </p>
          )}
          <div className="list">
            {recent.length === 0 && <div className="list-item footnote">Nothing yet</div>}
            {recent.map((m) => (
              <div key={m.date} className="list-item num">
                <div className="grow">{fmtDate(m.date, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                <span className="trail">
                  {m.weight != null ? `${m.weight} lb` : '—'} · {m.steps != null ? `${m.steps.toLocaleString()} steps` : '—'}
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>
      {toast}
    </>
  )
}
