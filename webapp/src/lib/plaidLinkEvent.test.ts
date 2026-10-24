import { describe, expect, it } from 'vitest'
import { linkEventRecord } from './plaid'
import { redactTokens } from '../../../supabase-changes/functions/_shared/redact'

describe('web Link events match the iOS client_diagnostics shape', () => {
  it('keeps session, institution, view, and error fields', () => {
    const record = linkEventRecord('TRANSITION_VIEW', {
      view_name: 'OAUTH',
      link_session_id: '01a16705-649e-75cb-8646-622b2f597f24',
      request_id: 'a0ffc9bf4b5c77b',
      institution_id: 'ins_56',
      institution_name: 'Chase',
      timestamp: '2026-10-23T04:29:44Z',
    })
    expect(record).toMatchObject({
      event: 'TRANSITION_VIEW',
      view_name: 'OAUTH',
      link_session_id: '01a16705-649e-75cb-8646-622b2f597f24',
      request_id: 'a0ffc9bf4b5c77b',
      institution_id: 'ins_56',
      institution_name: 'Chase',
    })
    expect(record.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('reads institution and error objects, and drops tokens', () => {
    const record = linkEventRecord(
      'EXIT',
      {
        status: 'requires_oauth',
        link_session_id: 'ls-1',
        institution: { institution_id: 'ins_56', name: 'Chase' },
        link_token: 'link-production-secret',
        public_token: 'public-production-secret',
      },
      { error_type: 'ITEM_ERROR', error_code: 'ITEM_LOGIN_REQUIRED', error_message: 'use update mode' },
    )
    expect(record).toMatchObject({
      event: 'EXIT',
      exit_status: 'requires_oauth',
      institution_id: 'ins_56',
      institution_name: 'Chase',
      error_type: 'ITEM_ERROR',
      error_code: 'ITEM_LOGIN_REQUIRED',
      error_message: 'use update mode',
    })
    expect(record).not.toHaveProperty('link_token')
    expect(record).not.toHaveProperty('public_token')
    expect(JSON.stringify(record)).not.toContain('link-production')
    expect(JSON.stringify(record)).not.toContain('public-production')
  })
})

describe('redactTokens', () => {
  it('redacts token fields at any depth and keeps session ids', () => {
    expect(
      redactTokens({
        link_session_id: '01a16b50-259b-72da-8946-62888835023f',
        link_token: 'link-production-abc',
        public_tokens: ['public-production-xyz'],
        events: [{ event_name: 'OPEN_OAUTH', metadata: { access_token: 'access-sandbox-1', institution_id: 'ins_56' } }],
      }),
    ).toEqual({
      link_session_id: '01a16b50-259b-72da-8946-62888835023f',
      link_token: '[redacted]',
      public_tokens: '[redacted]',
      events: [{ event_name: 'OPEN_OAUTH', metadata: { access_token: '[redacted]', institution_id: 'ins_56' } }],
    })
  })
})
