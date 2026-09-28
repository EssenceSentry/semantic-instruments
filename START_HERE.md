# Semantic Instruments

Five interactive mathematical tools, with a modern white interface and a weapons case study.

## Open the laboratory

On macOS, double-click **Start.command**. It serves the lab on this computer and opens it in your default browser. Keep the Terminal window it opens while you use the lab; press Control-C there, or close the window, to stop. Alternatively, from this folder run:

    python3 serve.py --directory site --port 8773 --open

The lab is at **http://127.0.0.1:8773/**. If that port is already in use, the next free port is used and the address is printed. For a fresh source checkout, run `npm ci` and `npm run build:site` first. Once the site is built, serving it needs only Python 3; if macOS offers to install the command line developer tools, accept. No cloud account is needed.

If macOS says it cannot verify Start.command, which happens for files from a downloaded ZIP, Control-click it and choose **Open**. On macOS 15 and later, open **System Settings → Privacy & Security** and click **Open Anyway** instead.

The weapons arrays, model weights, fonts, and numerical runtimes are local. The default paired-video dataset uses direct YouTube thumbnail URLs; previews need network access. No image files are included. The larger image collection remains available as a numerical reference without previews. Use Presentation cache to prepare the built-in datasets before presenting; computations are saved automatically as you rehearse. Optional image encoding downloads a pinned public SigLIP encoder from Hugging Face on first use; those encoder weights are not in this ZIP. Images remain on your machine.

## Present it

Open **Guided tour** for the weapons-specific narration, or choose the generic tour. On the paired videos, the narration list also offers **Auto-classifier · better learning with fewer labels**: the 16-stop auto-classifier presentation, where every step sets its own scene. Choose **Play automatically** to run it hands-free; Hold and Next take over at any time. Use the chapter list, Next/Back, and Escape to pause. Your place is saved locally. The compact bubbles show formulas and explanations beside live controls. The tour JSON files are in **site/tours/**; customize them or import a new narration through the tour menu.

## Try it

1. Pin an image in Space Explorer and follow it through the representations.
2. Open a query, a vector pair, or a neural layer in Transformation Workbench.
3. Change a collection summary and compare rankings.
4. Open Uncertainty Explorer's mini-audit: select matching images in a 3×3 grid, or type a count. The posterior and Monte Carlo intervals update from your answers.
5. Load the oscillator simulation to use the same tools without a classifier.

The **examples** folder also includes portable numeric datasets and the small, real browser-trained image model used during verification. Import one through the dataset menu. Its public package retains vectors, labels and fitted weights, with no image bytes. The toy model's fixture labels came from the supplied weapons annotations; it is a teaching example, not a performance benchmark.

Read **docs/GUIDE.md** for the walkthrough, **docs/DATA_CONTRACT.md** for reusable input formats, and **docs/VERIFICATION.md** for measured checks. **docs/THIRD_PARTY.md** and **docs/licenses/** contain dependency notices.

This is a small experimental laboratory. Existing presentations and original source repositories are separate and preserved. Source is available at https://github.com/EssenceSentry/semantic-instruments.

## Scene API and video captures

The editable source has been restored beside this portable site. `window.semanticInstruments` controls scenes, selections, mathematical parameters and capture components. See **docs/SCENE_API.md** for examples. Run `npm run build:site` after source changes to refresh the folder served by Start.command. Run `npm run capture -- examples/storyboards/weapons.json` to render the included example frames. Everything stays in this repository.
