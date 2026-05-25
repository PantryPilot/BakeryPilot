from __future__ import annotations

import uuid

import opik
from opik.evaluation import evaluate
from opik.evaluation.metrics import AnswerRelevance, Hallucination

from agent.config import OPIK_API_KEY, OPIK_PROJECT

opik.configure(api_key=OPIK_API_KEY or None, use_local=not bool(OPIK_API_KEY))

_DATASET_ITEMS = [
    {
        "id": "inv-1",
        "input": "What lots of blueberries are expiring this week at plant 1?",
        "expected_intent": "inventory",
        "context": "The agent should call query_lots with facility_id for plant 1.",
    },
    {
        "id": "inv-2",
        "input": "We're short on blueberries — what else can we bake?",
        "expected_intent": "inventory",
        "context": "The agent should call substitution_candidates for blueberry SKU.",
    },
    {
        "id": "proc-1",
        "input": "What is the landed cost if we order 800 kg of flour from Supplier B?",
        "expected_intent": "procurement",
        "context": "The agent should call compute_landed_cost with supplier_id and items.",
    },
    {
        "id": "proc-2",
        "input": "Draft an order for 1000 kg of sugar from Supplier A for next Monday.",
        "expected_intent": "procurement",
        "context": "The agent should call build_order_draft and return an action_card_id.",
    },
    {
        "id": "sched-1",
        "input": "Reschedule line 2 to avoid the dairy-gluten changeover on Thursday.",
        "expected_intent": "scheduler",
        "context": "The agent should route to the scheduler domain.",
    },
    {
        "id": "yield-1",
        "input": "Line 1 used 15% more flour than planned — what caused it?",
        "expected_intent": "yield",
        "context": "The agent should route to the yield domain for anomaly diagnosis.",
    },
    {
        "id": "esg-1",
        "input": "How many kilograms of waste have we avoided this month?",
        "expected_intent": "esg",
        "context": "The agent should route to the esg domain and call the waste counter tool.",
    },
    {
        "id": "general-1",
        "input": "Hello, what can you help me with today?",
        "expected_intent": "general",
        "context": "A greeting — should route to general and explain available capabilities.",
    },
]


def _task(item: dict) -> dict:
    from agent.agents.orchestrator import classify_intent
    from agent.state import AgentState
    from langchain_core.messages import HumanMessage

    state = AgentState(messages=[HumanMessage(content=item["input"])])
    result = classify_intent(state)
    intent = result.get("intent", "unknown")

    return {
        "output": intent,
        "expected": item["expected_intent"],
        "context": item["context"],
        "input": item["input"],
        "match": intent == item["expected_intent"],
    }


class IntentAccuracy(opik.evaluation.metrics.base_metric.BaseMetric):
    def __init__(self):
        super().__init__(name="intent_accuracy")

    def score(self, output: str, expected: str, **kwargs) -> opik.evaluation.metrics.score_result.ScoreResult:
        correct = output.strip() == expected.strip()
        return opik.evaluation.metrics.score_result.ScoreResult(
            name="intent_accuracy",
            value=1.0 if correct else 0.0,
            reason=f"predicted={output}, expected={expected}",
        )


def run_evaluation(experiment_name: str | None = None) -> None:
    dataset = opik.get_or_create_dataset(
        name="bakery-pilot-intent-classification",
        description="Intent classification evaluation for BakeryPilot agent",
    )
    dataset.insert(_DATASET_ITEMS)

    results = evaluate(
        dataset=dataset,
        task=_task,
        scoring_metrics=[
            IntentAccuracy(),
            AnswerRelevance(),
        ],
        experiment_name=experiment_name or f"intent-eval-{uuid.uuid4().hex[:8]}",
        project_name=OPIK_PROJECT,
        task_threads=1,
    )

    scores = [r.score_results for r in results.test_results]
    accuracy_vals = [
        s.value
        for row in scores
        for s in row
        if s.name == "intent_accuracy"
    ]
    if accuracy_vals:
        avg = sum(accuracy_vals) / len(accuracy_vals)
        print(f"Intent accuracy: {avg:.2%}  ({sum(v == 1.0 for v in accuracy_vals)}/{len(accuracy_vals)} correct)")
    else:
        print("No accuracy scores collected.")


if __name__ == "__main__":
    run_evaluation()
