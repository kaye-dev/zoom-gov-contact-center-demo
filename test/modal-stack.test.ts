import test from 'node:test';
import assert from 'node:assert/strict';
import { createModalStack } from '../app/components/admin/modal-stack';

class Element {
  inert = false;
  isConnected = true;
  attributes = new Map<string, string>();
  children: Element[] = [];
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  contains(element: Element): boolean { return this === element || this.children.some(child => child.contains(element)); }
}
function fixture() {
  const background = new Element(), trigger = new Element(), parent = new Element(), cancel = new Element(), child = new Element();
  background.children.push(trigger); parent.children.push(cancel);
  const body = { children: [background, parent], style: { overflow: 'auto' } };
  const document = { body, activeElement: trigger };
  const stack = createModalStack(document as unknown as Document);
  const first = stack.register(parent as unknown as HTMLElement);
  body.children.push(child); document.activeElement = cancel;
  const second = stack.register(child as unknown as HTMLElement);
  return { background, trigger, parent, cancel, child, body, document, first, second };
}

test('nested modal cancellation restores parent while keeping background isolated', () => {
  const f = fixture();
  assert.equal(f.first.isTop(), false); assert.equal(f.second.isTop(), true);
  assert.equal(f.background.inert, true); assert.equal(f.parent.inert, true); assert.equal(f.child.inert, false);
  assert.equal(f.second.release(), f.cancel);
  assert.equal(f.first.isTop(), true); assert.equal(f.parent.inert, false);
  assert.equal(f.background.inert, true); assert.equal(f.body.style.overflow, 'hidden');
  assert.equal(f.first.release(), f.trigger);
  assert.equal(f.background.inert, false); assert.equal(f.background.getAttribute('aria-hidden'), null);
  assert.equal(f.body.style.overflow, 'auto');
});

for (const order of ['parent-first', 'child-first'] as const) {
  test(`simultaneous nested modal unmount restores original state: ${order}`, () => {
    const f = fixture();
    f.parent.isConnected = false; f.cancel.isConnected = false; f.child.isConnected = false;
    const releases = order === 'parent-first' ? [f.first, f.second] : [f.second, f.first];
    assert.equal(releases[0].release(), null);
    assert.equal(releases[1].release(), f.trigger);
    assert.equal(f.background.inert, false); assert.equal(f.background.getAttribute('aria-hidden'), null);
    assert.equal(f.body.style.overflow, 'auto');
    assert.equal(releases[1].release(), null);
  });
}

test('modal restores preexisting background restrictions without taking ownership of them', () => {
  const background = new Element(), root = new Element();
  background.inert = true; background.setAttribute('aria-hidden', 'false');
  const document = { body: { children: [background, root], style: { overflow: 'clip' } }, activeElement: null };
  const entry = createModalStack(document as unknown as Document).register(root as unknown as HTMLElement);
  entry.release();
  assert.equal(background.inert, true); assert.equal(background.getAttribute('aria-hidden'), 'false');
  assert.equal(document.body.style.overflow, 'clip');
});
