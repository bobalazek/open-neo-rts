# Budget the complete native Audio journey

The current WebKit hosted run at `6e25308` passed 81 journeys and failed Audio
at the default 30-second case deadline. Its trace shows successful wheel input
and two-frame paint waits continuing through the narrow dropdown: about 166 ms
and 330 ms respectively, until the final frame wait exhausts the total budget.
The selection and resize regression passed in that same run.

Use a 120-second budget for this complete desktop/narrow preview, persistence,
storage-failure and reload journey, as other multi-screen native journeys do.
Assertions, actions, per-assertion deadlines, engine targets and retries stay
unchanged. A local fast pass alone does not qualify the slower hosted run.
