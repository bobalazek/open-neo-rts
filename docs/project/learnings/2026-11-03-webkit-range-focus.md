# Explicit Tab participation for the replay range

The replay browser check could programmatically focus its semantic range and use
Home/End, but sequential Tab navigation in the installed WebKit skipped it. In a
minimal browser page with a select, range and button, Tab from the select skipped
the range; explicitly setting the range's `tabindex="0"` made it the next target.
Chromium already included it. Preserve that explicit attribute alongside the
native focus bridge and timeline frame.

This is consistent with WebKit's platform-dependent sequential-focus behavior,
described in [WebKit issue 199671](https://bugs.webkit.org/show_bug.cgi?id=199671).
The local reproduction is the evidence for this specific range correction;
the issue describes the broader behavior and is not proof of every WebKit build.
The end-to-end test now walks speed → vision → timeline using Tab and observes
the native white focus border. It does not qualify a physical keyboard or every
Safari accessibility setting.
