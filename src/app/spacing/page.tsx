import Link from 'next/link';
import type { Metadata } from 'next';
import ThemeToggle from '@/components/ThemeToggle';

export const metadata: Metadata = {
  title: 'Spacing in memory testing • Genius Learning',
  description:
    'Reference notes for Genius spacing, grading, and the learning session loop.',
};

export default function SpacingGuidePage() {
  return (
    <main className="wrap article">
      <div className="toolbar aqua article__toolbar">
        <div className="title">Study system reference</div>
        <div className="spacer" />
        <Link href="/" className="toolbtn article__back">← Packs</Link>
        <ThemeToggle />
      </div>
      <article className="boxed article__content">
        <h1>Spacing in memory testing</h1>
        <p className="article__intro">
          These notes capture the scheduling, grading, and learning loop behaviours mirrored from
          the original Genius app.
        </p>

        <section className="article__section">
          <h2>1. Spacing in memory testing</h2>
          <ul>
            <li>
              <p>
                <strong>Association metadata you must track.</strong> Every card stores an integer
                <code>scoreNumber</code> (missing → unseen, 0 = last attempt wrong, &gt;0 = consecutive
                successes) and an optional <code>dueDate</code>; both values live in a mutable
                performance dictionary on each association object.
              </p>
            </li>
            <li>
              <p>
                <strong>Pre-session filtering.</strong> When you build a quiz session, iterate the full
                association list and reject any card whose parent pair is marked disabled or whose score
                falls below the caller&apos;s minimum. During this pass, clear any <code>dueDate</code> that has
                already elapsed so those cards can be rescheduled immediately.
              </p>
            </li>
            <li>
              <p>
                <strong>Randomization pipeline.</strong> After filtering, shuffle the survivors uniformly,
                then stably sort them by pair importance so higher-importance items are considered first
                when sampling the final quiz subset.
              </p>
            </li>
            <li>
              <p>
                <strong>Bucketed Poisson sampling.</strong> Group the sorted cards into buckets keyed by
                their score, compute Poisson weights for each bucket using the session&apos;s probability
                centre <code>m</code>, and repeatedly draw random variates into the cumulative distribution to
                pick exactly <code>count</code> cards without exceeding bucket sizes.
              </p>
            </li>
            <li>
              <p>
                <strong>Session sizing knobs.</strong> Clamp <code>count</code> to the available card count,
                and expose setters for <code>count</code>, <code>minimumScore</code>, and <code>mValue</code>
                so UI controls can request, for example, a review-only run (<code>minimumScore = 0</code>) or
                tweak the Poisson centre.
              </p>
            </li>
            <li>
              <p>
                <strong>Due-first iteration.</strong> Maintain a queue of scheduled cards sorted by their
                <code>dueDate</code>. Each call to <code>nextAssociation</code> first returns any card whose due
                time has passed; only when the queue head is still in the future does it fall back to the
                unscheduled list selected above.
              </p>
            </li>
            <li>
              <p>
                <strong>Exponential rescheduling rule.</strong> When a card is graded right, increment its
                score and schedule it <code>5^score</code> seconds into the future; wrong answers reset the
                score to zero before scheduling; skips clear both score and due date so selection can treat
                the card as unseen later.
              </p>
            </li>
            <li>
              <p>
                <strong>Queue insertion mechanics.</strong> Insert scheduled cards into the due-date-ordered
                queue at the first position whose existing due date is later than the new one, ensuring the
                queue stays sorted without reheapifying.
              </p>
            </li>
          </ul>
        </section>

        <section className="article__section">
          <h2>2. Closeness when entering the code</h2>
          <ul>
            <li>
              <p>
                <strong>Grading modes you must replicate.</strong> When the learner submits text, look up
                the stored matching mode and compute a scalar correctness value using one of: exact
                equality (0 or 1), case-insensitive equality (0 or 1), or fuzzy similarity (0.0–1.0).
              </p>
            </li>
            <li>
              <p>
                <strong>Default behaviour.</strong> Factory defaults register the fuzzy similarity mode, so a
                fresh install should initialise user preferences with <code>QuizMatchingMode</code> =
                <code>GeniusPreferencesQuizSimilarMatchingMode</code>.
              </p>
            </li>
            <li>
              <p>
                <strong>Fuzzy similarity algorithm.</strong> Build an in-memory SearchKit vector index, add
                the correct answer as a document, and compute <code>outScore = score(input) / score(target)</code>
                by querying both the perfect answer and the learner&apos;s text; clamp errors to zero if the
                index setup or searches fail.
              </p>
            </li>
            <li>
              <p>
                <strong>UI consequences of the score.</strong> A perfect 1.0 auto-accepts the answer, plays
                the “right” sound, increments the score, and reschedules the card. Any lower score shows the
                correct answer, optionally renders a diff, and sets the default button (Yes vs. No) based on
                whether the score crosses the 0.5 threshold; the learner can then confirm or override the
                grading.
              </p>
            </li>
          </ul>
        </section>

        <section className="article__section">
          <h2>3. Learning function</h2>
          <ul>
            <li>
              <p>
                <strong>Session loop.</strong> Each call to <code>runQuizOnce</code> advances the progress
                indicator, skips blank-answer cards, and fetches the next due association via the enumerator
                described above.
              </p>
            </li>
            <li>
              <p>
                <strong>First-exposure handling.</strong> If the association has no stored score
                (<code>isFirstTime</code>), present it in “review” mode: show the answer, prefill the entry
                field with that answer, and keep the input enabled so the learner can read it once;
                confirming the card records it as wrong (<code>score = 0</code>) so it enters active rotation
                immediately.
              </p>
            </li>
            <li>
              <p>
                <strong>Active recall cycle.</strong> For cards with a score, hide the answer, focus the
                entry field, collect the response, compute correctness as above, and display the answer plus
                any diff before rescheduling. Correct answers call <code>associationRight</code> (increment
                score and schedule), incorrect ones call <code>associationWrong</code> (reset to 0 and
                schedule), and skips invoke <code>associationSkip</code> (clear score/due date).
              </p>
            </li>
            <li>
              <p>
                <strong>Manual overrides.</strong> Dedicated Yes/No/Skip buttons reroute through the same
                enumerator hooks, letting users adjust the automated grading while preserving the spacing
                mechanics described in the scheduling section.
              </p>
            </li>
          </ul>
        </section>

        <section className="article__section">
          <h2>4. Detailed learning flow</h2>
          <ol>
            <li>
              <p>
                <strong>Starting the session.</strong> When the quiz begins, the controller stores the
                prepared <code>GeniusAssociationEnumerator</code>, presents the welcome panel, and runs the
                quiz window modally so focus remains on the session until it closes. After the window
                loads, other document windows hide, the distraction-reducing backdrop optionally fades
                in, and the progress indicator primes itself with the enumerator&apos;s queued card count.
              </p>
            </li>
            <li>
              <p>
                <strong>Fetching the next association.</strong> Each call to <code>runQuizOnce</code>
                advances the progress indicator, repeatedly asks the enumerator for the next
                association, and skips anything lacking an answer string before binding the chosen
                association to the UI widgets. The enumerator filters out disabled cards, clears
                expired due dates, randomises the surviving set, weights by pair importance, and caches
                the chosen subset so the session keeps a stable card list.
              </p>
            </li>
            <li>
              <p>
                <strong>Presenting new (“review”) cards.</strong> When the fetched association reports
                <code>isFirstTime</code>, the controller shows the answer immediately, enables the input
                field with that answer prefilled, switches the view to the review tab, and (when
                enabled) plays the “new card” sound to signal a read-through exposure. Pressing OK in
                this state routes through <code>handleEntry</code>, which marks the card wrong so its
                score becomes 0 and schedules it almost immediately (<code>5^0</code> seconds) for active
                recall on the next loop.
              </p>
            </li>
            <li>
              <p>
                <strong>Presenting learned (“quiz”) cards.</strong> Associations that already have a
                score hide the answer, clear and focus the entry field, and switch to the quiz tab so
                the learner must recall the answer. When the learner submits, the controller reveals the
                correct answer for comparison, locks the entry field, and enters the check tab before
                grading the input.
              </p>
            </li>
            <li>
              <p>
                <strong>Automated grading and feedback.</strong> Grading computes a correctness score
                according to the selected mode: exact match, case-insensitive match, or fuzzy
                similarity via the custom string comparator, yielding a float between 0 and 1. A
                perfect <code>1.0</code> plays the success sound (if enabled), increments the score,
                reschedules the card exponentially farther out, and immediately advances to the next
                association. Non-perfect results optionally render a highlighted diff, set the default
                button to “Yes” or “No” depending on whether the score exceeds 0.5, and play the
                corresponding audio cue while awaiting confirmation or override.
              </p>
            </li>
            <li>
              <p>
                <strong>Manual overrides and skips.</strong> The Yes/No/Skip controls and keyboard
                shortcuts end any active editing, forward to the enumerator to mark the card right,
                wrong, or skipped, and immediately queue the next association. Skipping clears both
                score and due date so the card returns to the unseen pool for later selection.
              </p>
            </li>
            <li>
              <p>
                <strong>Scheduling and recall timing.</strong> Every grading call flows into
                <code>_scheduleAssociation</code>, which sets the due date to “now plus
                <code>5^score</code> seconds” and inserts the card into a due-date–ordered queue so higher
                scores wait exponentially longer before resurfacing. Each request for
                <code>nextAssociation</code> first checks that queue and returns any card whose due time
                has arrived before falling back to the unscheduled list, guaranteeing recently reviewed
                items reappear as soon as they come due.
              </p>
            </li>
            <li>
              <p>
                <strong>Ending the session.</strong> When the enumerator runs out of cards, the
                controller closes the quiz window, triggering teardown: the backdrop fades out, normal
                document windows return, and modal execution stops to end the learning run cleanly.
              </p>
            </li>
          </ol>
        </section>
      </article>
    </main>
  );
}
