> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Fusion in Devin CLI

> Fusion pairs a frontier lead model with a cost-efficient sidekick, delivering frontier intelligence at a lower cost in Devin CLI.

## Selecting Fusion

Run `/fusion` during a session to open the Fusion model picker and choose your lead, effort, and sidekick.

You can switch away from Fusion to a specific model at any time with `/model`.

Fusion pairs a frontier lead model with a cost-efficient sidekick model, so you get frontier-level intelligence at a lower cost. The lead model owns your task — it plans, reasons through the hard parts, and reviews the work — while the sidekick handles the mechanical implementation. You interact with a single Devin; the pairing happens behind the scenes.

## How it works

When you select **Fusion**, two models work together on every session:

* **Lead**: a frontier model that drives planning, design decisions, investigations, and correctness-critical work.
* **Sidekick**: a smaller, more efficient model that executes the lead's plan — writing code, running builds and tests, and verifying changes.

Because most routine work runs on the cheaper sidekick model, a Fusion session costs meaningfully less than running the frontier model alone — frontier intelligence, for cheaper.

<Tip>Choose Fusion when you want top-tier quality on a complex task without paying frontier prices for every token.</Tip>

## Choosing a pairing

Fusion isn't a single model — it's a family of lead + sidekick pairings. In the model picker, select the **Fusion** family, then configure:

* **Lead**: which frontier model drives the session.
* **Effort**: how much compute the lead spends reasoning before responding.
* **Sidekick**: which cost-efficient model executes the work. All leads show a recommended sidekick.
* **Fast Mode**: swaps in faster variants of the same models where available — same intelligence, higher speed, at a higher cost.

Selecting `fusion` directly (for example `/model fusion`) opens the model picker.

## Availability

Fusion is available on paid plans in Devin CLI **3000.10.20+** and Devin Desktop **3.10.0+**. It's not included in free or trial tiers.

<Warning>Fusion is not available for customers on legacy or credit-based plans, including enterprise customers on legacy credits billing.</Warning>

## Pricing

Fusion bills each model in the pairing at its own rate: the lead at its frontier rate and the sidekick at its lower rate. You can see both rates in the model picker.

<Tabs>
  <Tab title="Self-serve">
    Lead and sidekick tokens draw down your quota at each model's own per-token rate.
  </Tab>

  <Tab title="Enterprise (Cognition Platform - ACUs)">
    For customers on the Cognition platform, Fusion usage is metered in **ACUs** (Agent Compute Units). ACU consumption scales with the tokens used by both the lead and the sidekick at their respective rates.
  </Tab>
</Tabs>

## Tips for getting the most out of Fusion

* **Start with Fable 5.1 + SWE-2.** This is our recommended pairing for best results. Fusion's instructions are tuned for how each pair works together, including how much detail the lead provides and what exploration it delegates.
* **Check your session's usage.** In Devin CLI, run `/session-stats` (or `/stats`) to see token usage, cost by model, and estimated Fusion savings when pricing data is available. Compare total cost and result quality across similar tasks rather than choosing models by token price alone.


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.