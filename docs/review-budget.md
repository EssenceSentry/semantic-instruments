# Which 100 videos should I review?

A reviewer can inspect 100 videos for the weapons-content label. The available scores are an image-only model and a model that combines image and text. I would start with the combined ranking if the job is to find the most labeled positives in those 100 slots. If the job is to discover channels, I would ask for a different evaluation.

## Spend the same review budget

The comparison uses all 2,875 labeled videos in the bundled channel-grouped development holdout. Each video has both scores and one binary evaluation label. Of these videos, 1,776 have a positive label. Sort each score independently and take the first *k*. Each cell below is a count of labeled positives.

| Videos reviewed | Image only | Image and text |
| ---: | ---: | ---: |
| 25 | 25 | 25 |
| 50 | 49 | 50 |
| **100** | **98** | **100** |
| 250 | 247 | 249 |

At 100, the queues share just 17 videos. Image only covers 43 distinct channels and the combined ranking covers 33. Two additional positives may be worth ten fewer channels when the review unit is a video. A channel discovery queue should measure unique positive channels at a fixed budget and test a per-channel cap.

## Inspect two disagreements

[Open the ranking comparator](https://essencesentry.github.io/semantic-instruments/#rank). Its left and right lanes show the image and combined model ranks. The optional fused rule in the comparator is a third calculation.

| Inspect in the lab | Image rank | Combined rank | Recorded label |
| --- | ---: | ---: | --- |
| [Image-only queue entry](https://essencesentry.github.io/semantic-instruments/?item=fzUf4jlN_v4#rank) | 44 | 1,400 | Negative in both modality annotations |
| [Combined queue entry](https://essencesentry.github.io/semantic-instruments/?item=pqsjkAY1QbQ#rank) | 494 | 1 | Positive in both modality annotations |

The first example is the highest-ranked negative that only the image model places in the first 100. The second is the highest-ranked positive that only the combined model places there. These examples show where the rankings differ. They cannot establish which words or pixels caused the difference.

## Reproduce the counts

From a checkout with Node.js 24, run `node scripts/review-budget.mjs`. It reads the shipped manifest and uses the lab’s ranking implementation, including its tie handling. The result describes this labeled development holdout. Before allocating a live review budget, I would repeat the comparison on a later, untouched channel sample with the same labeling rule.

[Calculation](../scripts/review-budget.mjs) · [Dataset and score definitions](../public/data/paired/manifest.json)
