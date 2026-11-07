A checkout of the Django source repository (django/django, a 4.0-era commit) in the current directory, without git history. A Python 3.9 virtualenv with Django's test dependencies is active (python on PATH; PYTHONPATH points at the checkout, so `import django` loads this source tree).

Future sessions will each start in a fresh checkout of Django at some commit of the 4.0/4.1 line and fix one bug reported on Django's issue tracker. They may be run by a smaller, cheaper model that has never worked on Django. They need to understand the reported behaviour, find the code responsible, make a fix, and check it with Django's own test suite.

Build tools that make that fast and reliable, for example:
- running specific Django tests (by module, class or test name) the way this repository expects, and returning a compact summary: counts, the failing tests, and the relevant lines of each traceback (not the whole log)
- running a short Python snippet against this source tree with Django configured (settings, database), to reproduce reported behaviour
- locating where a name is defined and where it is used across django/ (and finding the tests that cover a module)
Tools must work in any checkout of Django 4.x: read everything from ctx.projectDir at runtime, and do not hardcode line numbers or anything specific to the current commit.