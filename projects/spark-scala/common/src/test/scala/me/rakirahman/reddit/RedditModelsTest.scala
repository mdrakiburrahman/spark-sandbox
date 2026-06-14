package me.rakirahman.reddit

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class RedditModelsTest extends AnyFunSpec with Matchers {

  describe("RedditKinds") {

    it("should expose the canonical Reddit `kindPrefix_id36` prefixes") {
      RedditKinds.Comment shouldBe "t1_"
      RedditKinds.Account shouldBe "t2_"
      RedditKinds.Link shouldBe "t3_"
      RedditKinds.Message shouldBe "t4_"
      RedditKinds.Subreddit shouldBe "t5_"
      RedditKinds.Award shouldBe "t6_"
    }

    it("should expose deleted-author sentinels") {
      RedditKinds.DeletedAuthorId shouldBe "deleted"
      RedditKinds.DeletedAuthorName shouldBe "[deleted]"
    }
  }

  describe("RedditListingTypes") {

    it("should serialize the canonical Reddit listing names") {
      RedditListingTypes.Top.toString shouldBe "top"
      RedditListingTypes.New.toString shouldBe "new"
      RedditListingTypes.Hot.toString shouldBe "hot"
      RedditListingTypes.Rising.toString shouldBe "rising"
      RedditListingTypes.Controversial.toString shouldBe "controversial"
    }

    it("should accept the `t=` time-window only for Top and Controversial listings") {
      RedditListingTypes.acceptsTimeWindow(RedditListingTypes.Top) shouldBe true
      RedditListingTypes.acceptsTimeWindow(RedditListingTypes.Controversial) shouldBe true
      RedditListingTypes.acceptsTimeWindow(RedditListingTypes.New) shouldBe false
      RedditListingTypes.acceptsTimeWindow(RedditListingTypes.Hot) shouldBe false
      RedditListingTypes.acceptsTimeWindow(RedditListingTypes.Rising) shouldBe false
    }
  }

  describe("RedditTimeWindows") {

    it("should serialize the canonical Reddit time-window names") {
      RedditTimeWindows.Hour.toString shouldBe "hour"
      RedditTimeWindows.Day.toString shouldBe "day"
      RedditTimeWindows.Week.toString shouldBe "week"
      RedditTimeWindows.Month.toString shouldBe "month"
      RedditTimeWindows.Year.toString shouldBe "year"
      RedditTimeWindows.All.toString shouldBe "all"
    }
  }

  describe("RedditRawRow") {

    it("should preserve all positional fields on construction") {
      val row = RedditRawRow(
        fetchRunId = 1781467869114L,
        subreddit = "MicrosoftFabric",
        kind = "t3",
        parentId = null,
        postId = null,
        depth = null,
        fetchedAtEpochMs = 1718400000000L,
        payloadJson = """{"id":"abc","title":"hello"}"""
      )

      row.fetchRunId shouldBe 1781467869114L
      row.subreddit shouldBe "MicrosoftFabric"
      row.kind shouldBe "t3"
      row.parentId shouldBe null
      row.postId shouldBe null
      row.depth shouldBe null
      row.fetchedAtEpochMs shouldBe 1718400000000L
      row.payloadJson shouldBe """{"id":"abc","title":"hello"}"""
    }

    it("should carry typed comment metadata when populated") {
      val row = RedditRawRow(
        fetchRunId = 7L,
        subreddit = "MicrosoftFabric",
        kind = "t1",
        parentId = "t3_post1",
        postId = "t3_post1",
        depth = java.lang.Integer.valueOf(2),
        fetchedAtEpochMs = 1L,
        payloadJson = "{}"
      )
      row.kind shouldBe "t1"
      row.parentId shouldBe "t3_post1"
      row.depth.intValue() shouldBe 2
    }
  }
}
