"""4-level verification hierarchy: auto-commit / peer / supervisor / dual sign-off.

Routing is scored on magnitude (size vs. historical norms) x criticality
(ingredient's importance to active production runs). Every level stores the audio,
parsed record, verification chain, and confidence score as an immutable audit log.
"""
