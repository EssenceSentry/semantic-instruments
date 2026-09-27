# Third-party components

The following libraries power the browser laboratory. License texts copied from installed packages are in `licenses/`; retained bundle notices also apply.

| Component                     | Version                        | License    | Notice                                  |
| ----------------------------- | ------------------------------ | ---------- | --------------------------------------- |
| driver.js                     | 1.8.0                          | MIT        | driverjs-LICENSE                        |
| react                         | 19.3.0                         | MIT        | react-LICENSE                           |
| react-dom                     | 19.3.0                         | MIT        | react-dom-LICENSE                       |
| three                         | 0.180.0                        | MIT        | three-LICENSE                           |
| d3                            | 7.9.0                          | ISC        | d3-LICENSE                              |
| katex                         | 0.16.47                        | MIT        | katex-LICENSE                           |
| fflate                        | 0.8.3                          | MIT        | fflate-LICENSE                          |
| hyparquet                     | 1.31.1                         | MIT        | hyparquet-LICENSE                       |
| hyparquet-compressors         | 1.1.2                          | MIT        | hyparquet-compressors-LICENSE           |
| lucide-react                  | 0.468.0                        | ISC        | lucide-react-LICENSE                    |
| @tensorflow/tfjs-core         | 4.22.0                         | Apache-2.0 | Apache-2.0.txt; retained bundle notices |
| @tensorflow/tfjs-backend-wasm | 4.22.0                         | Apache-2.0 | Apache-2.0.txt; retained bundle notices |
| @huggingface/transformers     | 3.8.1                          | Apache-2.0 | huggingface-transformers-LICENSE        |
| onnxruntime-web               | 1.22.0-dev.20250409-89f8206ba4 | MIT        | onnxruntime-LICENSE                     |

DM Sans and Instrument Serif are distributed under the SIL Open Font License 1.1. The font license notices are included in the same directory.

The optional SigLIP encoder is `Xenova/siglip-base-patch16-224`, an ONNX conversion of Google SigLIP, at the pinned revision documented in the dataset contract. Its model card declares Apache-2.0. Encoder weights are downloaded on request and are not bundled in the portable site.

The supplied data and source-derived model parameters do not acquire an open-source license from these dependencies. Thumbnail URLs reference externally hosted YouTube previews; no image files are distributed.
