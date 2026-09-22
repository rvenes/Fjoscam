import { useState } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Modal } from './Modal';

afterEach(cleanup);

function Fixture() {
  const [first, setFirst] = useState(false);
  const [second, setSecond] = useState(false);
  return <main>
    <section><button onClick={() => setFirst(true)}>Open</button><button>Background</button></section>
    {first && <Modal title="First" onClose={() => setFirst(false)}><div>
      <button onClick={() => setSecond(true)}>Nested</button><input aria-label="Name" />
      <button disabled>Disabled</button><button onClick={() => setFirst(false)}>Close first</button>
    </div></Modal>}
    {second && <Modal title="Second" onClose={() => setSecond(false)}><div>
      <button onClick={() => setSecond(false)}>Close second</button>
      <button onClick={() => setFirst(false)}>Remove underlying</button>
    </div></Modal>}
  </main>;
}

describe('modal focus ownership', () => {
  it('traps Tab both ways, recaptures background focus and returns to the opener on Escape', () => {
    const view = render(<Fixture />); const opener = view.getByRole('button', { name: 'Open' });
    opener.focus(); fireEvent.click(opener);
    const dialog = view.getByRole('dialog', { name: 'First' });
    const first = view.getByRole('button', { name: 'Nested' }); const last = view.getByRole('button', { name: 'Close first' });
    expect(dialog).toHaveAttribute('aria-modal', 'true'); expect(first).toHaveFocus();
    expect(view.container.querySelector('section')!.inert).toBe(true);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Tab' }); expect(first).toHaveFocus();
    act(() => view.getByRole('button', { name: 'Background' }).focus()); expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Escape' }); expect(view.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus(); expect(view.container.querySelector('section')!.inert).toBeFalsy();
  });

  it('closes only the top dialog and keeps the remaining modal focused', () => {
    const view = render(<Fixture />); const opener = view.getByRole('button', { name: 'Open' }); opener.focus(); fireEvent.click(opener);
    const nested = view.getByRole('button', { name: 'Nested' }); fireEvent.click(nested);
    const first = view.getByRole('dialog', { name: 'First' }); const second = view.getByRole('dialog', { name: 'Second' });
    expect(first.inert).toBe(true); expect(second.inert).toBe(false);
    expect(Number(second.style.zIndex)).toBeGreaterThan(Number(first.style.zIndex));
    fireEvent.keyDown(view.getByRole('button', { name: 'Close second' }), { key: 'Escape' });
    expect(view.queryByRole('dialog', { name: 'Second' })).toBeNull(); expect(first.inert).toBe(false); expect(nested).toHaveFocus();
    fireEvent.keyDown(nested, { key: 'Escape' }); expect(opener).toHaveFocus();
  });

  it('keeps background inert when an underlying dialog disappears first', () => {
    const view = render(<Fixture />); fireEvent.click(view.getByRole('button', { name: 'Open' }));
    fireEvent.click(view.getByRole('button', { name: 'Nested' }));
    fireEvent.click(view.getByRole('button', { name: 'Remove underlying' }));
    expect(view.queryByRole('dialog', { name: 'First' })).toBeNull();
    expect(view.container.querySelector('section')!.inert).toBe(true);
    fireEvent.click(view.getByRole('button', { name: 'Close second' }));
    expect(view.container.querySelector('section')!.inert).toBeFalsy();
  });
});
