import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import { RoomEventInfo, validateRoomEventInfo } from './common';

chai.use(chaiSubset);

const valid: Readonly<RoomEventInfo> = {
  category: 'sports',
  subcategory: 'football',
  title: 'Finland vs. Argentina',
  description: 'Finland vs. Argentina FIFA 2022 world cup final',
  isListed: true,
  opponents: [
    {
      title: 'Finland',
      image: 'https://upload.wikimedia.org/wikipedia/commons/3/31/Huuhkajat_logo.svg',
    },
    {
      title: 'Argentina',
      image: 'https://upload.wikimedia.org/wikipedia/en/c/c1/Argentina_national_football_team_logo.svg',
    },
  ],
  outcomes: [
    { index: 0, title: 'Finland win' },
    { index: 1, title: 'Argentina win' },
    { index: 2, title: 'Tie' },
  ],
  resultSources: [
    { title: 'Official FIFA result page', url: 'https://www.youtube.com/watch?v=BEt3DcEQUbs' },
  ],
};

describe('validateEventInfo', () => {

  it('valid data', () => {
    expect(validateRoomEventInfo(valid)).to.be.true;
  });

  describe('invalid data', () => {

    it('missing category', () => {
      const data: Partial<RoomEventInfo> = { ...valid };
      expect(validateRoomEventInfo(data)).to.be.true;
      delete data.category;
      expect(validateRoomEventInfo(data)).to.be.false;
    });

    it('missing isListed', () => {
      const data: Partial<RoomEventInfo> = { ...valid };
      expect(validateRoomEventInfo(data)).to.be.true;
      delete data.isListed;
      expect(validateRoomEventInfo(data)).to.be.false;
    });

    it('empty title', () => {
      expect(validateRoomEventInfo({ ...valid, title: 'abc' })).to.be.true;
      expect(validateRoomEventInfo({ ...valid, title: 'ab' })).to.be.true;
      expect(validateRoomEventInfo({ ...valid, title: 'a' })).to.be.true;
      expect(validateRoomEventInfo({ ...valid, title: '' })).to.be.false;
    });

    it('just 1 opponent', () => {
      const { opponents: [oppenent0, opponent1] } = valid;
      expect(validateRoomEventInfo({ ...valid, opponents: [oppenent0, opponent1] })).to.be.true;
      expect(validateRoomEventInfo({ ...valid, opponents: [oppenent0] })).to.be.false;
    });

    it('just 1 outcome', () => {
      const { outcomes: [outcome0, outcome1] } = valid;
      expect(validateRoomEventInfo({ ...valid, outcomes: [outcome0, outcome1] })).to.be.true;
      expect(validateRoomEventInfo({ ...valid, outcomes: [outcome0] })).to.be.false;
    });

  });
});
