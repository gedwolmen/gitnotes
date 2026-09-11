const { SWIFTUICORE_WORKAROUND } = require('../../plugins/withExpoSqliteXcode26');

describe('withExpoSqliteXcode26', () => {
  test('does not escape Ruby swift_flags interpolation', () => {
    expect(SWIFTUICORE_WORKAROUND).toContain(
      '"#{swift_flags} -Xfrontend -disable-autolink-framework',
    );
    expect(SWIFTUICORE_WORKAROUND).not.toContain(
      '"\\#{swift_flags} -Xfrontend -disable-autolink-framework',
    );
  });
});
