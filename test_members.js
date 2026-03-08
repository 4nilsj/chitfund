const MemberService = require('./services/memberService');
async function test() {
  const result = await MemberService.getAllMembers({ type: 'all', status: 'active' }, { limit: 1000 });
  console.log(result.members);
}
test();
