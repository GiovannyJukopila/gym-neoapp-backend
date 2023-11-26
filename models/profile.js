class Profile {
  constructor(
    profileId,
    cardSerialNumber,
    membershipId,
    gymId,
    profileStartDate,
    profileEndDate,
    profileRenewDate,
    profileIsAdmin,
    profileAdminLevel,
    profileName,
    profileLastname,
    profileEmail,
    profileBirthday,
    profileTelephoneNumber,
    profileFile,
    profileFileWasUpload,
    profilePicture,
    profileStatus,
    profilePostalCode,
    profileAddress,
    profileCity,
    profileCountry,
    profileFrozen,
    profileFrozenDays,
    profileFrozenStartDate,
    profileUnFreezeStartDate,
    profileUnFreezeEndDate,
    profileUnFrozen,
    profileFileName,
    notCheckOut,
    wasCheckIn,
    role,
    profileGender
  ) {
    this.profileId = profileId;
    this.cardSerialNumber = cardSerialNumber;
    this.membershipId = membershipId;
    this.gymId = gymId;
    this.profileStartDate = profileStartDate;
    this.profileEndDate = profileEndDate;
    this.profileRenewDate = profileRenewDate;
    this.profileIsAdmin = profileIsAdmin;
    this.profileAdminLevel = profileAdminLevel;
    this.profileName = profileName;
    this.profileLastname = profileLastname;
    this.profileEmail = profileEmail;
    this.profileBirthday = profileBirthday;
    this.profileTelephoneNumber = profileTelephoneNumber;
    this.profileFile = profileFile;
    this.profileFileWasUpload = profileFileWasUpload;
    this.profilePicture = profilePicture;
    this.profileStatus = profileStatus;
    this.profilePostalCode = profilePostalCode;
    this.profileAddress = profileAddress;
    this.profileCity = profileCity;
    this.profileCountry = profileCountry;
    this.profileFrozen = profileFrozen;
    this.profileFrozenDays = profileFrozenDays;
    this.profileFrozenStartDate = profileFrozenStartDate;
    this.profileUnFreezeStartDate = profileUnFreezeStartDate;
    this.profileUnFreezeEndDate = profileUnFreezeEndDate;
    this.profileUnFrozen = profileUnFrozen;
    this.profileFileName = profileFileName;
    this.notCheckOut = notCheckOut;
    this.wasCheckIn = wasCheckIn;
    this.role = role;
    this.profileGender = profileGender;
  }
}

module.exports = Profile;
