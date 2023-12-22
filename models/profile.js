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
    profileGender,
    profileLastMembershipPrice,
    profileWasDiscount,
    profileWasComplementary,
    profileComplementaryReason,
    profileDiscountType,
    profileDiscountPercentage,
    profileDiscountValue,
    profileTotalReceive,
    renewMembershipInQueue,
    renewIsInQueue,
    profileCoupleName,
    profileCoupleEmail,
    profileIsACouple
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

    this.profileLastMembershipPrice = profileLastMembershipPrice;
    this.profileWasDiscount = profileWasDiscount;
    this.profileWasComplementary = profileWasComplementary;
    this.profileComplementaryReason = profileComplementaryReason;
    this.profileDiscountType = profileDiscountType;
    this.profileDiscountPercentage = profileDiscountPercentage;
    this.profileDiscountValue = profileDiscountValue;
    this.profileTotalReceive = profileTotalReceive;
    this.renewMembershipInQueue = renewMembershipInQueue;
    this.renewIsInQueue = renewIsInQueue;
    this.profileCoupleName = profileCoupleName;
    this.profileCoupleEmail = profileCoupleEmail;
    this.profileIsACouple = profileIsACouple;
  }
}

module.exports = Profile;
