// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SortableTableHead from '../src/components/shared/SortableTableHead';

afterEach(cleanup);

describe('SortableTableHead', () => {
  it('announces sort state and invokes the selected column callback', () => {
    const onSort = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <SortableTableHead label="Beneficiaries" column="beneficiaries" sort={{ key: 'beneficiaries', direction: 'desc' }} onSort={onSort} />
          </tr>
        </thead>
      </table>,
    );

    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'descending');
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Beneficiaries; currently desc' }));
    expect(onSort).toHaveBeenCalledWith('beneficiaries');
  });
});
