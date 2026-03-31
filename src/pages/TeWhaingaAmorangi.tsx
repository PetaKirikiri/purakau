import type { ReactNode } from 'react'
import {
  HiArrowPath,
  HiArrowTrendingUp,
  HiAcademicCap,
  HiChatBubbleBottomCenterText,
  HiCheck,
  HiCursorArrowRays,
  HiGlobeAsiaAustralia,
  HiLightBulb,
  HiQueueList,
  HiUserGroup,
} from 'react-icons/hi2'

const SIX_AREAS = [
  'Te Tiriti / NZ History',
  'Te ao Māori (worldview)',
  'Tikanga / kawa',
  'Te reo Māori',
  'Engagement with Māori',
  'Racial equity / institutional systems',
] as const

const LADDER_STEPS: { title: string; subtitle: string; accent: string }[] = [
  { title: 'Unfamiliar', subtitle: 'no awareness', accent: 'from-slate-100 to-slate-50 border-slate-200' },
  { title: 'Comfortable', subtitle: 'understands basics', accent: 'from-sky-50/90 to-white border-sky-200/80' },
  { title: 'Confident', subtitle: 'applies in real situations', accent: 'from-teal-50/90 to-white border-teal-200/80' },
  { title: 'Capable', subtitle: 'leads and supports others', accent: 'from-emerald-50/95 to-white border-emerald-200/90' },
]

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
      <span className="h-px w-8 shrink-0 bg-gradient-to-r from-teal-600/60 to-transparent" aria-hidden />
      {children}
    </h2>
  )
}

function PointRow({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3 text-slate-700">
      <HiCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-600/90" aria-hidden />
      <span className="leading-relaxed">{children}</span>
    </li>
  )
}

function CapabilityLadder() {
  return (
    <ol className="mx-auto max-w-lg space-y-3" aria-label="Capability progression: four levels from Unfamiliar to Capable">
      {LADDER_STEPS.map((step, index) => (
        <li key={step.title}>
          <div
            className={`relative overflow-hidden rounded-xl border bg-gradient-to-br px-5 py-4 shadow-sm ${step.accent}`}
          >
            <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-teal-500 to-teal-600/50 opacity-80" aria-hidden />
            <div className="pl-3">
              <div className="flex items-baseline gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-700/10 text-xs font-bold tabular-nums text-teal-800">
                  {index + 1}
                </span>
                <p className="text-lg font-semibold text-slate-900">{step.title}</p>
              </div>
              <p className="mt-1.5 pl-9 text-sm text-slate-600">{step.subtitle}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

export default function TeWhaingaAmorangi() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100/80 via-white to-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl space-y-14 px-5 py-12 pb-20 sm:px-6">
        <header className="rounded-2xl border border-slate-200/80 bg-white/70 px-6 py-8 shadow-sm backdrop-blur-sm sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-800/80">Explainer</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2rem]">
            Te Whainga Amorangi
          </h1>
          <p className="mt-4 max-w-2xl text-lg font-medium leading-snug text-slate-800">
            Te Whainga Amorangi is how we track real capability — not just learning.
          </p>
        </header>

        <section id="what-this-is" className="scroll-mt-8">
          <SectionLabel>What this is</SectionLabel>
          <ul className="mt-6 grid gap-3 sm:grid-cols-1">
            <PointRow>Based on the NZ public service capability framework</PointRow>
            <PointRow>Measures how people understand, use, and apply knowledge</PointRow>
            <PointRow>Focuses on real-world behaviour, not test scores</PointRow>
          </ul>
        </section>

        <section id="six-areas" className="scroll-mt-8">
          <SectionLabel>The six areas</SectionLabel>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {SIX_AREAS.map((name, i) => (
              <li
                key={name}
                className="group flex items-center gap-4 rounded-xl border border-slate-200/90 bg-white/90 px-4 py-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-600/15 to-slate-100 text-sm font-bold text-teal-900"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="text-sm font-medium leading-snug text-slate-900">{name}</span>
              </li>
            ))}
          </ul>
        </section>

        <section id="ladder" className="scroll-mt-8">
          <SectionLabel>The capability ladder</SectionLabel>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600">
            How we describe where someone sits right now — step by step.
          </p>
          <div className="mt-8 rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-teal-50/20 to-slate-50/50 p-6 sm:p-8">
            <CapabilityLadder />
            <p className="mx-auto mt-8 max-w-md rounded-lg bg-slate-900/5 px-4 py-3 text-center text-sm font-medium leading-relaxed text-slate-800">
              Progression is based on demonstrated behaviour, not just knowledge.
            </p>
          </div>
        </section>

        <section id="what-levels-mean" className="scroll-mt-8">
          <SectionLabel>What each level means</SectionLabel>
          <p className="mt-3 text-sm text-slate-600">Plain English — not the full framework wording.</p>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {(
              [
                {
                  title: 'Comfortable',
                  tint: 'border-t-teal-500/70 bg-teal-50/30',
                  lines: ['understands key concepts', 'can participate in simple situations'],
                },
                {
                  title: 'Confident',
                  tint: 'border-t-sky-500/70 bg-sky-50/40',
                  lines: ['applies knowledge correctly', 'operates independently in real contexts'],
                },
                {
                  title: 'Capable',
                  tint: 'border-t-emerald-600/70 bg-emerald-50/35',
                  lines: ['adapts to new situations', 'supports or guides others'],
                },
              ] as const
            ).map((block) => (
              <div
                key={block.title}
                className={`rounded-xl border border-slate-200/80 border-t-4 ${block.tint} px-5 py-5 shadow-sm`}
              >
                <h3 className="text-base font-semibold text-slate-900">{block.title}</h3>
                <ul className="mt-4 space-y-3">
                  {block.lines.map((line) => (
                    <li key={line} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                      <HiCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section id="how-people-move" className="scroll-mt-8">
          <SectionLabel>How people move up</SectionLabel>
          <p className="mt-5 text-lg font-semibold text-slate-900">Capability grows through real use.</p>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-3">
            {(
              [
                { icon: HiAcademicCap, label: 'Learning content builds understanding' },
                { icon: HiQueueList, label: 'Practice builds confidence' },
                { icon: HiChatBubbleBottomCenterText, label: 'Real interactions build capability' },
              ] as const
            ).map((step, idx, arr) => (
              <div key={step.label} className="flex flex-1 items-center gap-2 sm:flex-col sm:text-center">
                <div className="flex flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:flex-col sm:py-5">
                  <step.icon className="h-8 w-8 text-teal-700/90" aria-hidden />
                  <p className="text-sm font-medium leading-snug text-slate-800">{step.label}</p>
                </div>
                {idx < arr.length - 1 ? (
                  <HiArrowTrendingUp
                    className="hidden h-6 w-6 shrink-0 text-slate-300 sm:block sm:rotate-90 lg:rotate-0"
                    aria-hidden
                  />
                ) : null}
              </div>
            ))}
          </div>
          <p className="mt-6 rounded-lg border border-dashed border-teal-200/80 bg-teal-50/40 px-4 py-3 text-center text-sm text-slate-700">
            Repeated, correct use is what drives progression.
          </p>
        </section>

        <section id="what-we-track" className="scroll-mt-8">
          <SectionLabel>What we track</SectionLabel>
          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                { icon: HiLightBulb, label: 'understanding' },
                { icon: HiCursorArrowRays, label: 'usage' },
                { icon: HiArrowPath, label: 'consistency' },
                { icon: HiGlobeAsiaAustralia, label: 'real-world application' },
              ] as const
            ).map((item) => (
              <li
                key={item.label}
                className="flex items-center gap-4 rounded-xl border border-slate-200/90 bg-white px-4 py-4 shadow-sm"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <item.icon className="h-6 w-6" aria-hidden />
                </span>
                <span className="text-sm font-medium capitalize text-slate-900">{item.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section id="how-different" className="scroll-mt-8">
          <SectionLabel>How this is different</SectionLabel>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-100/60 px-5 py-6 text-center sm:text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Traditional</p>
              <p className="mt-2 text-sm font-medium text-slate-700">Learning tracks completion.</p>
            </div>
            <div className="rounded-xl border border-teal-200/90 bg-gradient-to-br from-teal-50 to-white px-5 py-6 text-center sm:text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Here</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">We track capability.</p>
            </div>
          </div>
        </section>

        <footer className="border-t border-slate-200/80 pt-10">
          <div className="flex items-start gap-3 rounded-xl bg-slate-100/50 px-4 py-3">
            <HiUserGroup className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
            <p className="text-xs leading-relaxed text-slate-600">
              Aligned with the Māori Crown Relations Capability Framework used across the NZ public service.
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
