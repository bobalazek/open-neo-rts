# New definitions from authored templates

Task 2-38b3 extends the existing content editor with **New from selected** for a
clean unit, structure or prop. The selected definition is the template; authors
provide a sibling folder slug and display name. IDs retain their kind and
namespace. Exact self-references are remapped, while other references and local
weapon/ability names retain their existing meaning. This creates author drafts,
not additions to the built-in roster or new gameplay balance.

The whole co-located folder is copied, including models, editable sources and
asset metadata. Those bytes and their existing credits are preserved. The pack
manifest receives the new definition path. The same shared definition, reference,
gameplay, provenance and model checks block invalid creation. Full runtime audio,
source freshness and exact formatter parity remain task 2-38b2; JSON currently
uses the existing editor's two-space output and final newline.

## Saving and recovery

Writable selected folders publish the manifest after all new payload files have
been written, read back and validated. A manifest or destination conflict stops
creation. Existing payload files are never intentionally replaced. A failed
creation removes only new files whose bytes still match this operation, plus its
uncommitted empty files. Changed or inaccessible files are retained with recovery
feedback. Empty folders may remain and can be reused on a retry. A close error
after a successful manifest commit is recognized by reading the actual manifest;
an uncertain or externally changed manifest retains all new files.

Browser file access does not provide an atomic multi-file transaction or exclusive
file creation. These are optimistic checks, like existing definition saves;
authors should avoid concurrent external writes while creation runs. Cleanup
also checks current path bytes before removing an entry. This cannot guarantee
isolation against another application changing the same path between checks.

Read-only folders download a stored ZIP containing the new folder and updated
manifest. Writable folders also offer that download. It is a **changes bundle**,
not a complete pack: extract it into a copy of the selected pack. Downloads never
change the source. Paths, entry counts and total sizes are bounded; no archive
dependency is added. Template copies including editable sources are limited to
256 MiB, alongside the existing combined-runtime and JSON bounds.

## Presentation

Creation temporarily replaces the existing native definition form with two
framed fields and pinned create/download/cancel actions. The original model and
source identity stay visible. Busy operations lock the controls; errors retain
the entered names, and cancellation returns to the original definition. A saved
definition is selected and previewed through the same editor controller. No new
visual world or raster asset is introduced.
