import type { ReactNode } from 'react'

const SIX_AREAS = [
  'Te Tiriti / NZ History',
  'Te ao Māori',
  'Tikanga / kawa',
  'Te reo Māori',
  'Engagement with Māori',
  'Racial equity / institutional systems',
] as const

const LADDER_STEPS: { title: string; subtitle: string }[] = [
  { title: 'Unfamiliar', subtitle: 'no awareness' },
  { title: 'Comfortable', subtitle: 'understands basics' },
  { title: 'Confident', subtitle: 'applies in real situations' },
  { title: 'Capable', subtitle: 'leads and supports others' },
]

function Section({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-8">
      {children}
    </section>
  )
}

function CapabilityLadder() {
  return (
    <ol
      className="relative mx-auto max-w-md border-l-2 border-slate-300 pl-8"
      aria-label="Capability progression: four levels from Unfamiliar to Capable"
    >
      {LADDER_STEPS.map((step) => (
        <li key={step.title} className="relative pb-10 last:pb-0">
          <span
            className="absolute -left-[9px] top-1.5 h-4 w-4 rounded-full border-2 border-slate-700 bg-white"
            aria-hidden
          />
          <p className="text-lg font-semibold text-slate-900">{step.title}</p>
          <p className="mt-1 text-sm text-slate-600">— {step.subtitle}</p>
        </li>
      ))}
    </ol>
  )
}

export default function TeWhaingaAmorangi() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl space-y-12 px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Explainer</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Te Whainga Amorangi
          </h1>
        </header>

        <Section id="what-this-is">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">What this is</h2>
          <p className="mt-4 text-xl font-semibold leading-snug text-slate-900">
            Te Whainga Amorangi is how we track real capability — not just learning.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-700">
            <li>Based on the NZ public service capability framework</li>
            <li>Measures how people understand, use, and apply knowledge</li>
            <li>Focuses on real-world behaviour, not test scores</li>
          </ul>
        </Section>

        <Section id="six-areas">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">The six areas</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {SIX_AREAS.map((name) => (
              <li
                key={name}
                className="flex min-h-[3.25rem] items-center rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm"
              >
                {name}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="ladder">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            The capability ladder
          </h2>
          <p className="mt-1 text-sm text-slate-600">How we describe where someone sits right now.</p>
          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <CapabilityLadder />
            <p className="mt-8 border-t border-slate-100 pt-6 text-center text-sm font-medium text-slate-800">
              Progression is based on demonstrated behaviour, not just knowledge.
            </p>
          </div>
        </Section>

        <Section id="what-levels-mean">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            What each level means
          </h2>
          <p className="mt-1 text-sm text-slate-600">A plain-English read—not the full framework text.</p>
          <div className="mt-6 space-y-8">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Comfortable</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                <li>understands key concepts</li>
                <li>can participate in simple situations</li>
              </ul>
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Confident</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                <li>applies knowledge correctly</li>
                <li>operates independently in real contexts</li>
              </ul>
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Capable</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                <li>adapts to new situations</li>
                <li>supports or guides others</li>
              </ul>
            </div>
          </div>
        </Section>

        <Section id="how-people-move">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            How people move up
          </h2>
          <p className="mt-4 text-lg font-semibold text-slate-900">Capability grows through real use.</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-700">
            <li>Learning content builds understanding</li>
            <li>Practice builds confidence</li>
            <li>Real interactions build capability</li>
          </ul>
          <p className="mt-4 text-sm text-slate-600">
            Repeated, correct use is what drives progression.
          </p>
        </Section>

        <Section id="what-we-track">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">What we track</h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {(['understanding', 'usage', 'consistency', 'real-world application'] as const).map((item) => (
              <li
                key={item}
                className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800"
              >
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="how-different">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            How this is different
          </h2>
          <div className="mt-4 space-y-2 text-slate-800">
            <p>Traditional learning tracks completion.</p>
            <p className="font-medium text-slate-900">This tracks capability.</p>
          </div>
        </Section>

        <footer className="border-t border-slate-200 pt-8">
          <p className="text-xs leading-relaxed text-slate-500">
            Aligned with the Māori Crown Relations Capability Framework used across the NZ public service.
          </p>
        </footer>
      </div>
    </div>
  )
}
