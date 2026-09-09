/** A late response may never replace the currently selected industry's draft. */
export class SettingsRequestSequence {
  private sequence = 0;
  next() {
    return ++this.sequence;
  }
  current(sequence: number) {
    return sequence === this.sequence;
  }
}
